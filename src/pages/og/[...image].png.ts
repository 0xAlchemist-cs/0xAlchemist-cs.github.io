import type { APIRoute, GetStaticPaths } from 'astro';
import { posts, projects } from '../../lib/content';
import {
  postCard,
  projectCard,
  resolveSocialCard,
  type SocialCard,
} from '../../lib/social-card';
import { renderSocialCard, verifiedFont } from '../../lib/render-social-card';

export const prerender = true;

export const getStaticPaths: GetStaticPaths = async () => {
  // The bundled build resource remains mandatory, even when every card is art.
  await verifiedFont();
  const [allPosts, allProjects] = await Promise.all([posts(), projects()]);
  const cards = await Promise.all(
    [
      ...allPosts.map(({ data }) => postCard(data)),
      ...allProjects.map(({ data }) => projectCard(data)),
    ].map((card) => resolveSocialCard(card)),
  );
  return cards.map((card) => ({
    params: {
      image: card.image.src.replace(/^\/og\//, '').replace(/\.png$/, ''),
    },
    props: { card },
  }));
};

export const GET: APIRoute = async ({ props }) => {
  const card = props.card as SocialCard;
  const png = card.approvedArt?.png ?? (await renderSocialCard(card));
  return new Response(new Uint8Array(png), {
    headers: { 'Content-Type': 'image/png' },
  });
};
