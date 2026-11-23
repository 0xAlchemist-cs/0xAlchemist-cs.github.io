---
title: 'CodeFormer 推理改进：让整张照片完成上色、修补与原尺寸输出'
description: '一次基于 CodeFormer 的课程实验：接入整图人脸上色和掩码修补，修正贴回遮罩，并用输出尺寸、逐像素对照和指标表检查改进。'
slug: 'codeformer-whole-image-improvements'
publishedAt: '2026-11-23'
draft: false
example: false
featured: true
category: '项目实践'
tags: ['CodeFormer', '计算机视觉', 'PyTorch', '图像修复']
relatedRepos: ['sczhou/CodeFormer']
references:
  - title: 'CodeFormer 原论文：Towards Robust Blind Face Restoration with Codebook Lookup Transformer'
    url: 'https://arxiv.org/abs/2206.11253'
  - title: 'CodeFormer 官方使用说明与预训练模型'
    url: 'https://github.com/sczhou/CodeFormer/blob/b33cc7d639d6545bfcccc7e0bc6ae51f24e79c2b/README.md'
  - title: '官方整图复原入口'
    url: 'https://github.com/sczhou/CodeFormer/blob/b33cc7d639d6545bfcccc7e0bc6ae51f24e79c2b/inference_codeformer.py'
  - title: '官方人脸上色入口'
    url: 'https://github.com/sczhou/CodeFormer/blob/b33cc7d639d6545bfcccc7e0bc6ae51f24e79c2b/inference_colorization.py'
  - title: '官方人脸修补入口'
    url: 'https://github.com/sczhou/CodeFormer/blob/b33cc7d639d6545bfcccc7e0bc6ae51f24e79c2b/inference_inpainting.py'
  - title: 'NTU S-Lab License 1.0'
    url: 'https://github.com/sczhou/CodeFormer/blob/b33cc7d639d6545bfcccc7e0bc6ae51f24e79c2b/LICENSE'
---

一张照片送进人脸处理模型之前，往往还有不少事情要做：找到人脸、裁剪对齐、准备遮罩；模型返回结果之后，还要把人脸放回原来的位置，处理边缘，并确认输出尺寸。

这次计算机视觉课程项目，我把改进重点放在了这些环节上。基于 [CodeFormer](https://github.com/sczhou/CodeFormer) 的官方预训练模型，我扩展了整图人脸上色与修补流程，增加原尺寸输出选项，并处理了上色结果贴回照片时的颜色渗漏。

CodeFormer 是 Shangchen Zhou 等人在 NeurIPS 2022 提出的人脸复原方法，通过离散码本与 Transformer 预测恢复人脸细节。我的这次工作沿用它的模型和权重，主要调整推理入口、坐标变换和结果融合。[原论文](https://arxiv.org/abs/2206.11253)

## 把裁剪人脸的能力接到整张照片上

官方的整图复原脚本已经具备人脸检测、对齐和贴回流程；上色与修补脚本则要求输入为 **512×512 的已对齐人脸**。如果手里是一张完整照片，就需要额外准备裁剪图，再处理结果的位置关系。

我的做法是复用已有的整图处理管线，将上色和修补模型接进去：

```text
整张照片 → 检测人脸 → 对齐到 512×512 → 逐脸推理
         → 反向坐标变换 → 遮罩融合贴回 → 按目标尺寸保存
```

新增的两个入口分别是：

- `inference_colorization_whole.py`：接收整图，给检测到的灰度人脸上色，再贴回照片。
- `inference_inpainting_whole.py`：接收整图和遮罩，将需要修补的位置投影到人脸坐标中，再融合结果。

这里的“整图”描述输入和输出的组织方式。人脸模型负责它能够处理的区域，背景和衣物的完整上色仍需要其他模型。

## 原尺寸输出，要检查文件的真实宽高

原来的整图复原默认使用 2 倍输出。与此同时，辅助流程会先把短边小于 512 像素的图片放大，这使得 `--upscale 1` 也未必能直接保留输入文件的尺寸。

我增加了 `--keep_resolution`：记住输入图像的宽高，在人脸贴回完成后，将结果缩放回这个尺寸。改进版保留原入口的默认行为，需要原尺寸时显式开启：

```bash
python inference_codeformer.py -w 0.7 -s 1 --keep_resolution \
  -i inputs/whole_imgs -o results/keep_res_all
```

下面是直接读取输入和输出文件得到的尺寸，单位为像素，顺序为宽×高：

| 样例 | 输入尺寸 | 原默认输出 | 原尺寸输出 |
| ---- | -------- | ---------- | ---------- |
| 00   | 491×310  | 1622×1024  | 491×310    |
| 01   | 248×189  | 1344×1024  | 248×189    |
| 02   | 1204×645 | 2408×1290  | 1204×645   |
| 03   | 400×225  | 1820×1024  | 400×225    |
| 04   | 225×225  | 1024×1024  | 225×225    |
| 05   | 191×264  | 1024×1416  | 191×264    |
| 06   | 726×838  | 1452×1676  | 726×838    |

这七张样例的原尺寸输出，宽高均与输入一致。这个改进解决的是输出画幅的可控性，内部的人脸推理窗口仍然是 512×512。

整理对比图时，我还遇到了一个展示问题：如果把所有图片都缩到相同高度，225×225 和 1024×1024 的结果看起来很接近。因此，尺寸差异应该用真实宽高或相同缩放系数展示，不能只凭网页上的显示大小判断。

## 上色结果贴回时，灰度和遮罩都要重新检查

接入整图上色时，第一个问题出现在模型推理之后：辅助函数 `add_restored_face()` 会在整图为灰度时，将恢复结果转回灰度。这对原来的复原流程有其用途，却会抹掉刚生成的颜色。

我的上色入口直接保存彩色人脸结果，再交给贴回流程，避免经过这次灰度转换。已有颜色的人脸则跳过上色推理。

接下来暴露的问题更细：脸有颜色了，脖子与脸的衔接却不自然，衣服边缘还出现了肤色。排查后，修改集中在三个地方：

1. **核对当前解析模型的类别含义。** 当前权重的区域可视化中，13 对应头发、17 对应脖子、18 对应衣服。原有允许区域已经包含头发，扩展时应加入脖子并排除衣服。
2. **在原始对齐人脸上生成解析图。** 上色后的图像可能让解析器改变区域判断，原始裁剪图能避免这一步生成结果对区域选择的干扰。
3. **模糊后重新限制融合范围。** 高斯模糊会让透明度扩散到相邻区域，需要再按解析类别将不允许的区域清零。

下面是这部分的逻辑简写，实际实现仍保留原有流程的默认分支：

```python
labels = parse_face(original_aligned_face)
allowed = np.isin(labels, [*range(1, 14), 15, 17])
alpha = allowed.astype(np.float32)
alpha = cv2.GaussianBlur(alpha, (101, 101), 11)
alpha = cv2.GaussianBlur(alpha, (101, 101), 11)
alpha[~allowed] = 0
```

<figure style="margin: 1.5rem 0">
  <a href="/images/codeformer-improvements/colorization-comparison.png">
    <img src="/images/codeformer-improvements/colorization-comparison.png" alt="样例 03 的三列对比：灰度输入、初版整图上色、修正贴回遮罩后的结果；右图衣服边缘的肤色渗漏减少" width="2238" height="420" loading="lazy" />
  </a>
  <figcaption>从左到右：灰度输入、初版整图上色、修正贴回流程后的结果。点击图片可查看原尺寸。输入为 CodeFormer 仓库样例，结果来自本次本地实验。</figcaption>
</figure>

这一步让我更重视“颜色该出现在哪里”。增加彩色覆盖面积很容易，限制不该改变的区域，才是贴回流程需要解决的问题。

## 修补时，照片和遮罩必须使用同一套坐标

整图修补接收两份输入：照片和同尺寸遮罩，白色表示待修补区域。人脸经过对齐后，遮罩也必须沿着相同的仿射变换进入 512×512 坐标系，否则模型处理的位置就会与用户圈定的位置错开。

我复用了辅助流程保存的每张人脸的仿射矩阵，并对二值遮罩使用最近邻插值：

```python
mask_face = cv2.warpAffine(
    whole_image_mask, affine_matrix, (512, 512),
    flags=cv2.INTER_NEAREST,
)
```

进入模型之前，按原脚本约定将损伤区涂白。推理之后，在对齐人脸内保留未遮罩部分，只将模型输出混入遮罩区域。与遮罩没有足够交集的人脸跳过修补推理。

<figure style="margin: 1.5rem 0">
  <a href="/images/codeformer-improvements/inpainting-comparison.png">
    <img src="/images/codeformer-improvements/inpainting-comparison.png" alt="样例 06 的整图修补对比：左为带白色涂鸦的输入，中为遮罩，右为修补结果；人脸处损伤得到修补，背景白线仍然保留" width="1038" height="400" loading="lazy" />
  </a>
  <figcaption>从左到右：损伤输入、遮罩、修补结果。人脸区域的白色笔画得到修补，背景白线仍然保留。输入为 CodeFormer 仓库样例，损伤由实验合成。</figcaption>
</figure>

最终照片仍会经历对齐、反变换和融合，因此“在对齐人脸内保留未遮罩部分”与“整张输出每个未遮罩像素都完全不变”是两个不同的要求。边缘与重采样也需要单独观察。

## 用对照实验分清每项改进的收益

实验使用仓库自带的 7 张整图样例，在本地 Windows 与 RTX 4060 Laptop 环境中运行。修补实验使用合成的白色涂鸦；复原实验使用下采样、模糊、噪声与 JPEG 压缩产生退化输入，以干净原图作为参考。

我把验证拆成了三个问题。

**第一，尺寸是否保持？** 直接读取图片文件宽高，七个原尺寸输出均与输入一致。这样也避开了“评测时先缩放图片，再检查尺寸”的干扰。

**第二，接入整图流程后，上色模型本身的输出是否改变？** 对同一批对齐裁剪，比较原上色脚本的输出与整图流程贴回前的输出，17 对图像的解码像素全部一致。上色这部分的主要收益，是把原有能力接入完整照片的处理链路，以及改善后续融合。

**第三，复原结果与参考图的差异如何？** 下表是复原实验的完整 PSNR 与 LPIPS 记录。PSNR 越高表示像素误差越小；LPIPS 越低表示该指标衡量的感知差异越小，两者关注的方面不同。

| 样例 | PSNR：退化输入 → 输出（dB） | LPIPS：退化输入 → 输出 |
| ---- | --------------------------- | ---------------------- |
| 00   | 26.37 → 26.42               | 0.3663 → 0.3416        |
| 01   | 26.98 → 27.26               | 0.2782 → 0.1674        |
| 02   | 34.72 → 34.11               | 0.2796 → 0.2873        |
| 03   | 29.16 → 29.09               | 0.2269 → 0.1947        |
| 04   | 25.62 → 25.98               | 0.3161 → 0.2803        |
| 05   | 25.45 → 25.54               | 0.3321 → 0.3129        |
| 06   | 35.00 → 33.48               | 0.2953 → 0.2959        |

这组样例中，4 张的 PSNR 提升，5 张的 LPIPS 改善。它记录的是预训练模型复原与整图处理共同产生的结果，尺寸保持功能的效果则由前面的宽高对照单独验证。

修补图中的样例 06，在损伤掩码内的 PSNR 从 4.94 dB 提升到 7.03 dB；将掩码区域结果合成到参考图后计算的 LPIPS 从 0.0609 降到 0.0517。这是该样例的修补对比，与上表的全图退化复原实验使用不同输入和评价范围。

上色实验还记录了 Colorfulness，用来观察颜色丰富程度。它适合检查流程是否保留了颜色，却不能代替真实颜色是否准确的判断。贴回修正的效果，需要结合衣服、脖子等区域的对比图一起看。

完整实验表随本文提供，包含其余指标与全部样例：

- [输出尺寸对照](/downloads/codeformer-improvements/output-sizes.csv)
- [整图修补指标](/downloads/codeformer-improvements/inpainting.csv)
- [整图上色指标](/downloads/codeformer-improvements/colorization.csv)
- [复原与原尺寸输出指标](/downloads/codeformer-improvements/restoration.csv)
- [贴回修正前后的 Colorfulness](/downloads/codeformer-improvements/colorization-paste.csv)

## 从模型输出走到用户能用的结果

这次课程项目中，我借助 AI 助手协作完成代码修改、实验和文档整理，并通过前后对比检查效果、推动修正。最终形成的四项改进是：原尺寸输出、整图人脸上色、带遮罩的整图人脸修补，以及上色贴回区域的修正。

其中最有启发的，是一些很容易被忽略的细节：灰度转换可能抹掉上色结果，类别表对不上可能让衣服染色，遮罩坐标不一致会让修补位置偏移，而相同显示高度又可能掩盖真实的尺寸差异。

模型给出一张人脸之后，工程工作还没有结束。让输入容易准备，让处理区域明确，让输出尺寸可控，再用匹配的问题和指标检查结果，这些环节一起决定了模型能力能否真正用起来。
