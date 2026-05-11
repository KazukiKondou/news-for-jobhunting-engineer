import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const articleSchema = z.object({
  title: z.string(),
  summary: z.string(),
  source: z.string(),
  sourceUrl: z.string().url(),
  tags: z.array(z.string()).default([]),
});

export const collections = {
  days: defineCollection({
    loader: glob({ pattern: '*.md', base: './src/content/days' }),
    schema: z.object({
      date: z.coerce.date(),
      intro: z.string().optional(),
      articles: z.array(articleSchema).min(1),
    }),
  }),
};

export type Article = z.infer<typeof articleSchema>;
