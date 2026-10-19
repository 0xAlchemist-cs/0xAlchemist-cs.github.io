import { absolute, site } from '../config/site';
export function breadcrumbs(items: { name: string; path: string }[]) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: [{ name: '首页', path: '/' }, ...items].map(
      (item, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: item.name,
        item: absolute(item.path),
      }),
    ),
  };
}
export function articleSchema(data: {
  title: string;
  description: string;
  slug: string;
  publishedAt: Date;
  updatedAt?: Date;
  cover?: string;
  canonical?: string;
}) {
  return {
    '@type': 'BlogPosting',
    headline: data.title,
    description: data.description,
    datePublished: data.publishedAt.toISOString(),
    dateModified: (data.updatedAt ?? data.publishedAt).toISOString(),
    author: {
      '@type': 'Person',
      name: site.author,
      '@id': absolute('/about/#author'),
      url: absolute('/about/'),
    },
    mainEntityOfPage: data.canonical ?? absolute(`/blog/${data.slug}/`),
    image: absolute(data.cover ?? '/images/default-og.png'),
    inLanguage: site.language,
  };
}
