import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { postSchema, projectSchema } from './lib/schemas';

export const collections = {
  posts: defineCollection({
    loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/posts' }),
    schema: postSchema,
  }),
  projects: defineCollection({
    loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/projects' }),
    schema: projectSchema,
  }),
};
