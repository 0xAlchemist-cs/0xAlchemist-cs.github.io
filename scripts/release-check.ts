import { loadContent } from './content-files';
import { writeReport } from './report';

const content = await loadContent();
const errors = [...content.errors];
const publicPosts = content.posts.filter(
  (post) => !post.data.draft && !post.data.example,
);
if (!publicPosts.length)
  errors.push(
    '正式上线至少需要一篇真实公开文章。请新增原创文章，勿仅移除示例标记来冒充真实内容。',
  );
await writeReport('release-readiness', {
  checked: publicPosts.length,
  errors,
  warnings: [],
});
