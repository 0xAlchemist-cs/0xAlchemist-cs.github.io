import { loadContent } from './content-files';
import { writeReport } from './report';

const { posts, projects, errors } = await loadContent();
const warnings: string[] = [];
for (const collection of [posts, projects]) {
  const seen = new Set<string>();
  for (const entry of collection) {
    if (seen.has(entry.data.slug))
      errors.push(`${entry.file}: 重复 slug ${entry.data.slug}`);
    seen.add(entry.data.slug);
  }
}
const titles = new Set<string>();
for (const post of posts) {
  const prefix = post.file;
  if (titles.has(post.data.title)) errors.push(`${prefix}: 文章标题重复。`);
  titles.add(post.data.title);
  if (post.data.description.length < 20 || post.data.description.length > 180)
    warnings.push(`${prefix}: 摘要长度建议人工复核（非排名公式）。`);
  if (post.data.title.length > 60)
    warnings.push(`${prefix}: 标题较长，建议检查搜索展示。`);
  const prose = post.body.replace(/```[\s\S]*?```|~~~[\s\S]*?~~~/g, '');
  for (const image of prose.matchAll(/!\[([^\]]*)\]\([^)]*\)/g)) {
    if (!image[1]?.trim()) errors.push(`${prefix}: Markdown 图片缺少 alt。`);
  }
  for (const image of prose.matchAll(/<img\b[^>]*>/gi)) {
    if (!/\balt\s*=\s*["'][^"']+["']/i.test(image[0]))
      errors.push(`${prefix}: HTML 图片缺少 alt。`);
  }
  if ((prose.match(/^## /gm)?.length ?? 0) < 2)
    warnings.push(`${prefix}: 章节较少，请人工确认结构是否清楚。`);
  if (/\d+(?:\.\d+)?\s*[%％]/.test(prose) && !post.data.references.length)
    warnings.push(`${prefix}: 含百分比但未列参考资料，请核实数据来源。`);
  if (post.data.publishedAt > new Date())
    warnings.push(
      `${prefix}: 发布日期在未来；本项目不提供定时发布，非草稿仍会公开。`,
    );
}
for (const project of projects) {
  for (const slug of project.data.relatedPosts) {
    const post = posts.find((entry) => entry.data.slug === slug);
    if (!post) errors.push(`${project.file}: 关联文章 ${slug} 不存在。`);
    else if (
      !project.data.example &&
      !project.data.draft &&
      (post.data.example || post.data.draft)
    )
      warnings.push(
        `${project.file}: 关联文章 ${slug} 尚未公开，生产页面不会显示该链接。`,
      );
  }
}
if (!posts.some((post) => !post.data.draft && !post.data.example))
  warnings.push('尚无真实公开文章；本地构建允许，正式发布门禁会阻止上线。');
await writeReport('seo-content', {
  checked: posts.length + projects.length,
  errors,
  warnings,
});
