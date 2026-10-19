import { getCollection, type CollectionEntry } from 'astro:content';
import { isVisible } from './schemas';
export { topicGroups } from './schemas';

export type Post = CollectionEntry<'posts'>;
export type Project = CollectionEntry<'projects'>;

export async function posts() {
  return (
    await getCollection('posts', ({ data }) =>
      isVisible(data, import.meta.env.DEV),
    )
  ).sort(
    (a, b) =>
      b.data.publishedAt.getTime() - a.data.publishedAt.getTime() ||
      a.data.slug.localeCompare(b.data.slug),
  );
}
export async function projects() {
  return await getCollection('projects', ({ data }) =>
    isVisible(data, import.meta.env.DEV),
  );
}
export const dateLabel = (date: Date) =>
  new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'Asia/Shanghai',
  }).format(date);
export const readingMinutes = (body = '') =>
  Math.max(
    1,
    Math.ceil(
      (body.match(/[\u3400-\u9fff]/g)?.length ?? 0) / 350 +
        (body.match(/[a-zA-Z0-9]+/g)?.length ?? 0) / 200,
    ),
  );

export const yearLabel = (date: Date) =>
  new Intl.DateTimeFormat('en', {
    year: 'numeric',
    timeZone: 'Asia/Shanghai',
  }).format(date);

export function linkedProjects(post: Post, all: Project[]) {
  return all.filter(
    (project) =>
      post.data.relatedRepos.some(
        (repo) =>
          repo.toLowerCase() === project.data.repoFullName?.toLowerCase(),
      ) || project.data.relatedPosts.includes(post.data.slug),
  );
}
export function linkedPosts(project: Project, all: Post[]) {
  return all.filter(
    (post) =>
      project.data.relatedPosts.includes(post.data.slug) ||
      post.data.relatedRepos.some(
        (repo) =>
          repo.toLowerCase() === project.data.repoFullName?.toLowerCase(),
      ),
  );
}
