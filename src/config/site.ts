export const site = {
  githubUsername: '0xAlchemist-cs',
  url: 'https://0xalchemist-cs.github.io',
  title: '0xAlchemist 的博客',
  author: '0xAlchemist',
  description: '记录技术实践，整理沿途的发现。这里也留一点位置，给生活与思考。',
  language: 'zh-CN',
  github: 'https://github.com/0xAlchemist-cs',
  pageSize: 8,
} as const;

export const absolute = (path = '/') => new URL(path, site.url).href;
