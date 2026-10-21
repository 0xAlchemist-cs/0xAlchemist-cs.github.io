import { createHash } from 'node:crypto';
import { site } from '../config/site';
import { readApprovedShareArt, type ApprovedShareArt } from './share-art';

export interface SocialImage {
  src: string;
  alt: string;
  width: number;
  height: number;
}

export interface SocialCard {
  approvedArt?: ApprovedShareArt;
  kind: 'blog' | 'projects';
  slug: string;
  title: string;
  label: string;
  tags: string[];
  author: string;
  siteTitle: string;
  siteHost: string;
  templateVersion: string;
  fontVersion: string;
  image: SocialImage;
}

export async function resolveSocialCard(
  card: SocialCard,
  root = process.cwd(),
): Promise<SocialCard> {
  const approvedArt = await readApprovedShareArt(
    { kind: card.kind, slug: card.slug },
    root,
  );
  if (!approvedArt) return card;
  const hash = createHash('sha256')
    .update(
      JSON.stringify({
        version: 'approved-share-art-1',
        card: card.image.src,
        image: approvedArt.manifest.image.sha256,
        layout: approvedArt.manifest.layout.sha256,
        font: card.fontVersion,
      }),
    )
    .digest('hex')
    .slice(0, 12);
  return {
    ...card,
    approvedArt,
    image: {
      ...card.image,
      src: `/og/${card.kind}/${card.slug}-${hash}.png`,
      alt: approvedArt.manifest.alt,
    },
  };
}

export const defaultSocialImage: SocialImage = {
  src: '/images/default-og.png',
  alt: `${site.title} · ${site.description}`,
  width: 1200,
  height: 630,
};

function card(
  kind: SocialCard['kind'],
  slug: string,
  title: string,
  label: string,
  tags: string[],
): SocialCard {
  const rendered = {
    kind,
    title,
    label,
    tags: tags.slice(0, 3),
    author: site.author,
    siteTitle: site.title,
    siteHost: new URL(site.url).hostname,
    templateVersion: 'social-card-1',
    fontVersion: 'NotoSansCJKsc-Regular-Sans2.004-2c76254f6fc3',
  };
  const hash = createHash('sha256')
    .update(JSON.stringify(rendered))
    .digest('hex')
    .slice(0, 12);
  return {
    ...rendered,
    slug,
    image: {
      src: `/og/${kind}/${slug}-${hash}.png`,
      alt: `${title} · ${site.title}`,
      width: 1200,
      height: 630,
    },
  };
}

export function postCard(data: {
  slug: string;
  title: string;
  category: string;
  tags: string[];
}): SocialCard {
  return card('blog', data.slug, data.title, data.category, data.tags);
}

export function projectCard(data: {
  slug: string;
  displayName: string;
  techStack: string[];
}): SocialCard {
  return card('projects', data.slug, data.displayName, '项目', data.techStack);
}
