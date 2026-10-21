import type { APIRoute, GetStaticPaths } from 'astro';
import { posts, projects } from '../../lib/content';
import { postCard, projectCard, type SocialCard } from '../../lib/social-card';
import { renderSocialCard } from '../../lib/render-social-card';

export const prerender = true;

export const getStaticPaths: GetStaticPaths = async () => {
  const [allPosts, allProjects] = await Promise.all([posts(), projects()]);
  const cards = [
    ...allPosts.map(({ data }) => postCard(data)),
    ...allProjects.map(({ data }) => projectCard(data)),
  ];
  return cards.map((card) => ({
    params: {
      image: card.image.src.replace(/^\/og\//, '').replace(/\.png$/, ''),
    },
    props: { card },
  }));
};

export const GET: APIRoute = async ({ props }) => {
  const png = await renderSocialCard(props.card as SocialCard);
  return new Response(new Uint8Array(png), {
    headers: { 'Content-Type': 'image/png' },
  });
};
