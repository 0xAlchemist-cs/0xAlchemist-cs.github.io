import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import sharp, { type OverlayOptions } from 'sharp';
import type { SocialCard } from './social-card';
import { safeArtFile } from './share-art';

const fontSha256 =
  '2c76254f6fc379fddfce0a7e84fb5385bb135d3e399294f6eeb6680d0365b74b';
const fontFamily = 'Noto Sans CJK SC';
const titleWidth = 1024;

export const artFontNames = ['sans', 'wenkai'] as const;
export type ArtFontName = (typeof artFontNames)[number];
const artFonts = {
  sans: {
    file: 'NotoSansCJKsc-Regular.otf',
    sha256: fontSha256,
    family: fontFamily,
  },
  wenkai: {
    file: 'lxgw-wenkai/LXGWWenKai-Regular.ttf',
    sha256: '2d73eea94ad808999d90c0000c239a84a33b09d4bc6ab6c5b8bbf1eda8a7fc8b',
    family: 'LXGW WenKai',
  },
} as const;

export async function verifiedFont(root = process.cwd()): Promise<string> {
  return (await verifiedArtFont('sans', root)).file;
}

export async function verifiedArtFont(
  name: ArtFontName,
  root = process.cwd(),
): Promise<{ file: string; family: string }> {
  if (!Object.hasOwn(artFonts, name)) throw new Error('Unknown share-art font');
  const definition = artFonts[name];
  const file = path.resolve(root, 'assets/fonts', definition.file);
  let bytes: Buffer;
  try {
    await safeArtFile(
      root,
      path.posix.join('assets/fonts', path.posix.dirname(definition.file)),
      path.posix.basename(definition.file),
    );
    bytes = await readFile(file);
  } catch (error) {
    throw new Error(`Social-card font missing or unreadable: ${file}`, {
      cause: error,
    });
  }
  if (createHash('sha256').update(bytes).digest('hex') !== definition.sha256) {
    throw new Error(`Social-card font SHA256 mismatch: ${file}`);
  }
  return { file, family: definition.family };
}

function escapeMarkup(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function textInput(
  text: string,
  size: number,
  fontfile: string,
  color: string,
  family = fontFamily,
) {
  return {
    text: {
      text: `<span foreground="${color}" fallback="false">${escapeMarkup(text)}</span>`,
      font: `${family} ${size}`,
      fontfile,
      rgba: true,
      dpi: 72,
    },
  };
}

function graphemes(text: string): string[] {
  return Array.from(
    new Intl.Segmenter('zh-CN', { granularity: 'grapheme' }).segment(text),
    ({ segment }) => segment,
  );
}

export interface ShareArtTextBox {
  left: number;
  top: number;
  width: number;
  height: number;
  fontSize: number;
  color: string;
  font?: ArtFontName;
}

// Candidate-time typography: keep every glyph within its measured box.
export async function renderBoundedShareArtText(
  value: string,
  box: ShareArtTextBox,
  fontfile: string,
  family = fontFamily,
): Promise<Buffer> {
  for (let size = box.fontSize; size >= 1; size--) {
    const input = textInput(value, size, fontfile, box.color, family);
    const { data, info } = await sharp({
      text: { ...input.text, width: box.width, wrap: 'word-char' },
    })
      .png()
      .toBuffer({ resolveWithObject: true });
    if (info.width <= box.width && info.height <= box.height) return data;
  }
  throw new Error('Share-art text cannot fit its layout box without overflow');
}

async function measuredWidth(
  text: string,
  size: number,
  fontfile: string,
): Promise<number> {
  if (!text.trim()) return 0;
  const { info } = await sharp(textInput(text, size, fontfile, '#223045'))
    .png()
    .toBuffer({ resolveWithObject: true });
  return info.width;
}

// Probe progressively so even a very long title never creates a giant text layer.
async function fittingPrefix(
  parts: string[],
  size: number,
  width: number,
  fontfile: string,
): Promise<number> {
  let low = 0;
  let high = 1;
  while (
    high < parts.length &&
    (await measuredWidth(parts.slice(0, high).join(''), size, fontfile)) <=
      width
  ) {
    low = high;
    high = Math.min(high * 2, parts.length);
  }
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (
      (await measuredWidth(parts.slice(0, middle).join(''), size, fontfile)) <=
      width
    ) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }
  return low;
}

export interface SocialCardTitleLayout {
  lines: string[];
  fontSize: number;
}

async function titleLayout(
  title: string,
  fontfile: string,
): Promise<SocialCardTitleLayout> {
  const parts = graphemes(title.replace(/\s+/gu, ' ').trim());
  for (let size = 62; size >= 44; size -= 2) {
    let remaining = parts;
    const lines: string[] = [];
    for (let line = 0; line < 3 && remaining.length; line++) {
      const count = await fittingPrefix(remaining, size, titleWidth, fontfile);
      lines.push(remaining.slice(0, Math.max(count, 1)).join('').trimEnd());
      remaining = remaining.slice(Math.max(count, 1));
      while (remaining[0] === ' ') remaining = remaining.slice(1);
    }
    if (!remaining.length) return { lines, fontSize: size };
    if (size === 44) {
      const last = graphemes(lines[2] ?? '');
      while (
        last.length &&
        (await measuredWidth(`${last.join('')}…`, size, fontfile)) > titleWidth
      ) {
        last.pop();
      }
      lines[2] = `${last.join('').trimEnd()}…`;
      return { lines, fontSize: size };
    }
  }
  throw new Error('Unable to lay out social-card title');
}

export async function layoutSocialCardTitle(
  title: string,
): Promise<SocialCardTitleLayout> {
  return titleLayout(title, await verifiedFont());
}

async function fitLabel(
  text: string,
  size: number,
  width: number,
  fontfile: string,
): Promise<string> {
  const parts = graphemes(text.replace(/\s+/gu, ' ').trim());
  const count = await fittingPrefix(parts, size, width, fontfile);
  if (count === parts.length) return parts.join('');
  const kept = parts.slice(0, count);
  while (
    kept.length &&
    (await measuredWidth(`${kept.join('')}…`, size, fontfile)) > width
  ) {
    kept.pop();
  }
  return `${kept.join('').trimEnd()}…`;
}

export async function renderSocialCard(card: SocialCard): Promise<Buffer> {
  const fontfile = await verifiedFont();
  const title = await titleLayout(card.title, fontfile);
  const layers: OverlayOptions[] = [];
  async function addText(
    value: string,
    size: number,
    color: string,
    left: number,
    top: number,
    width: number,
  ) {
    const text = await fitLabel(value, size, width, fontfile);
    if (!text) return;
    layers.push({
      input: await sharp(textInput(text, size, fontfile, color))
        .png()
        .toBuffer(),
      left,
      top,
    });
  }

  await addText(card.label, 24, '#335ddd', 88, 99, 450);
  await addText(card.siteTitle, 20, '#637084', 730, 102, 382);
  for (const [index, line] of title.lines.entries()) {
    await addText(
      line,
      title.fontSize,
      '#223045',
      88,
      171 + index * 76,
      titleWidth,
    );
  }
  for (const [index, tag] of card.tags.slice(0, 3).entries()) {
    await addText(tag, 21, '#335ddd', 104 + index * 310, 442, 258);
  }
  await addText(card.author, 23, '#223045', 88, 531, 420);
  await addText(card.siteHost, 21, '#637084', 650, 533, 462);

  // Shapes only: every visible glyph is rendered via the verified local font.
  const shapes =
    Buffer.from(`<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
    <rect width="1200" height="630" fill="#f7f8fc"/>
    <rect x="40" y="40" width="1120" height="550" rx="24" fill="#ffffff"/>
    <rect x="88" y="64" width="72" height="8" rx="4" fill="#335ddd"/>
    <path d="M88 507H1112" stroke="#e6eaf3"/>
    ${card.tags
      .slice(0, 3)
      .map(
        (_, i) =>
          `<rect x="${88 + i * 310}" y="430" width="290" height="48" rx="12" fill="#edf1ff"/>`,
      )
      .join('')}
  </svg>`);
  return sharp(shapes).composite(layers).png().toBuffer();
}
