# 按全文设计 AI 分享图

日常可以直接对 Codex 说：“请读完这篇文章，给它做分享图。”每篇图先有全文设计简报，再用当前会话内置生图工具创作，最后由你确认完整图片。文字使用仓库中经过校验的本地字体排版，最终为 1200×630 PNG。

网站、命令和 GitHub Actions 不调用模型，不需要额外模型 Key。生图使用当前会话的工具与额度，不承诺无限免费使用。命令负责整理输入、合成和保存，不能代替 Codex 阅读理解全文。

## 准备完整输入

在项目目录运行，替换目标 slug；项目使用 `projects/<slug>`。每次选一个新的版本目录，避免覆盖之前的简报或候选。

```powershell
powershell -ExecutionPolicy Bypass -File scripts/project.ps1 share-art prepare blog/no-need-to-be-the-sun --out reports/share-art/blog/no-need-to-be-the-sun/v2
```

输出包含 `input.md`、`snapshot.json` 和 `GUIDE.md`。Codex 需读完 `input.md` 中的全部正文和 frontmatter，项目还包含已关联的本地文章；过长时分段读完，不能仅凭标题、摘要或被截断的工具输出设计。代码不会自动抓取外部网页，也不会自动调用 AI。

简报应写清核心观点、读者、语气、画面构思、构图与配色、准确文字和避免事项。将简报 Markdown、内置工具生成的本地原图、实际提示词及工具记录保存在 `reports/share-art/`。只有工具实际提供模型名称时才记录模型名。

## 合成带文字的候选

给模型的插画提示词说明标题区域的留白，先生成主体画面，再创建版本 1 的排版 JSON。文字自动读取文章完整标题、作者和站点域名，JSON 只放位置、大小、颜色和可选字体。每个文字框的 `font` 可选 `sans`（Noto Sans CJK SC，默认）或 `wenkai`（霞鹜文楷，适合随笔标题）。两者均随仓库保存原始字体、授权和 SHA256，合成时校验，不下载网络字体。例如：

```json
{
  "version": 1,
  "title": {
    "left": 64,
    "top": 210,
    "width": 480,
    "height": 120,
    "fontSize": 64,
    "color": "#22374c",
    "font": "wenkai"
  },
  "author": {
    "left": 68,
    "top": 518,
    "width": 420,
    "height": 38,
    "fontSize": 24,
    "color": "#41556e"
  },
  "site": {
    "left": 68,
    "top": 561,
    "width": 460,
    "height": 26,
    "fontSize": 18,
    "color": "#647991"
  }
}
```

```powershell
powershell -ExecutionPolicy Bypass -File scripts/project.ps1 share-art compose --bundle reports/share-art/blog/no-need-to-be-the-sun/v2 --artwork reports/share-art/design/no-need-to-be-the-sun/artwork-v2.png --brief reports/share-art/design/no-need-to-be-the-sun/brief.md --layout reports/share-art/design/no-need-to-be-the-sun/layout.json --tool image_gen --alt '明亮书房中，一位普通人安静写作，暖灯与窗外蓝色远景相映。'
```

每次合成创建新的 `candidate-...` 子目录，保存原始插画、简报、排版、`final.png` 和 `candidate.json`。预览 `final.png`，检查主题表达、中文、裁切、文字可读性和品牌。候选尚未发布，也不会因为生成成功就自动入库。源正文或品牌在准备后变化会拒绝合成／确认；重新准备新版本，复核当前文章后再确认。

入库后的资源以摘要命名并校验，`assets/share-art/` 排除在自动代码格式化之外，避免修改已经确认的原始文件。变更简报、排版或图片时，请创建新候选，不要直接编辑这些文件。

## 作者确认后入库

**只有作者明确确认上方具体最终 PNG 后，Codex 才可执行此步。确认简报不等于确认图片。** 将实际候选目录和作者的具体确认记录传入：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/project.ps1 share-art approve --candidate 'reports/share-art/blog/no-need-to-be-the-sun/v2/candidate-实际标识' --confirmation '作者在当前会话中确认了该最终 PNG，记录对应版本和摘要'
```

正式文件进入 `assets/share-art/blog/<slug>/` 或 `assets/share-art/projects/<slug>/`，清单为 `manifest.json`，资源使用摘要文件名。保留原始插画和旧版本，最终 PNG 的摘要与预览一致。这里是构建资源目录，会随公开仓库提交，不要加入私人数据或凭据；简报、提示词与原始插画均不直接作为网页公开资源。

选图后走正常 PR 检查与确认合并流程。构建原样输出确认过的 PNG，不重新排版；页面 OG、Twitter 与文章 JSON-LD 共用该图。正文封面独立维护。

## 正文更新与换图

完整来源变化时，审计提醒需要复核，继续使用已确认图片。阅读更新后的正文后，如果原图仍然合适，作者明确确认保留后执行：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/project.ps1 share-art review blog/no-need-to-be-the-sun --confirmation '作者复核当前正文后，确认保留现有最终 PNG'
```

这只更新来源与复核记录，保留图片字节。需要改变图上的标题、品牌或布局时，准备新版本并生成／合成新候选，再确认；修改画面内容继续使用生图工具。候选合成可以规范尺寸和排版。

未配置清单的内容继续使用文字卡片。明确配置的文件丢失、损坏、摘要不符、越界、存在符号链接或缺少确认时检查失败；先修正问题再发布，不绕过校验。草稿与示例仍不进入生产图片、搜索、RSS 或 Sitemap。

构建后打开 `reports/share-preview.html`，查看来源、确认和待复核状态。线上检查还需在部署后验证真实图片的 HTTP 状态、格式、尺寸与页面引用。Google／Bing 账号操作仍独立留待后续完成。
