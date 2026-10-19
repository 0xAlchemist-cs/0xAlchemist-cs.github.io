import rss from '@astrojs/rss';
import { posts } from '../lib/content';
import { site } from '../config/site';
export async function GET() {
  return rss({
    title: site.title,
    description: site.description,
    site: site.url,
    trailingSlash: true,
    items: (await posts())
      .filter((post) => !post.data.draft && !post.data.example)
      .map((post) => ({
        title: post.data.title,
        description: post.data.description,
        pubDate: post.data.publishedAt,
        link: `/blog/${post.data.slug}/`,
      })),
    customData: '<language>zh-CN</language>',
  });
}
