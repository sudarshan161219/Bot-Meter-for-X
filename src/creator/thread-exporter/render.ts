// Draws carousel slides on a canvas (browser only). Layout comes from
// ./slides.ts; this file only paints it.

import type { Tweet } from '../types';
import { BODY_WIDTH, LINE_HEIGHT, paginate, SLIDE, type Slide, type Theme } from './slides';

const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Color Emoji", sans-serif';

export interface Author {
  name: string;
  handle: string;
  verified: boolean;
  /** Loaded avatar, or null to draw an initial instead. */
  avatar: ImageBitmap | null;
}

/** Text for a post on a slide; posts with only media get a short label. */
export function slideText(t: Tweet): string {
  if (t.text.trim()) return t.text;
  const photos = t.media.filter((m) => m.type === 'photo').length;
  if (photos) return photos === 1 ? '📷 Photo' : `📷 ${photos} photos`;
  return t.media.length ? '🎬 Video' : '';
}

/**
 * Loads the author's avatar for the slide header. X's image server may refuse
 * cross-origin reads; then the header shows an initial instead.
 */
export async function loadAvatar(url: string | null): Promise<ImageBitmap | null> {
  if (!url) return null;
  try {
    const res = await fetch(url.replace(/_normal(\.\w+)$/, '_400x400$1'), { credentials: 'omit' });
    if (!res.ok) return null;
    return await createImageBitmap(await res.blob());
  } catch {
    return null;
  }
}

export function layoutSlides(tweets: readonly Tweet[]): Slide[] {
  const ctx = document.createElement('canvas').getContext('2d');
  if (!ctx) return [];
  const measure = (text: string, fontSize: number): number => {
    ctx.font = `${fontSize}px ${FONT}`;
    return ctx.measureText(text).width;
  };
  return paginate(tweets.map(slideText), measure);
}

function drawHeader(ctx: CanvasRenderingContext2D, author: Author, theme: Theme): void {
  const size = 96;
  const x = SLIDE.padding;
  const y = SLIDE.padding;
  ctx.save();
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  ctx.clip();
  if (author.avatar) ctx.drawImage(author.avatar, x, y, size, size);
  else {
    ctx.fillStyle = theme.accent;
    ctx.fillRect(x, y, size, size);
    ctx.fillStyle = theme.background;
    ctx.font = `700 44px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(Array.from(author.name || author.handle)[0]?.toUpperCase() ?? '?', x + size / 2, y + size / 2 + 2);
  }
  ctx.restore();

  const tx = x + size + 28;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = theme.text;
  ctx.font = `700 40px ${FONT}`;
  const name = author.name || author.handle;
  ctx.fillText(name, tx, y + 42, BODY_WIDTH - size - 28 - (author.verified ? 50 : 0));
  if (author.verified) {
    const w = Math.min(ctx.measureText(name).width, BODY_WIDTH - size - 78);
    ctx.fillStyle = theme.accent;
    ctx.beginPath();
    ctx.arc(tx + w + 26, y + 28, 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = theme.background;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(tx + w + 19, y + 28);
    ctx.lineTo(tx + w + 24, y + 34);
    ctx.lineTo(tx + w + 33, y + 22);
    ctx.stroke();
  }
  ctx.fillStyle = theme.muted;
  ctx.font = `34px ${FONT}`;
  ctx.fillText(`@${author.handle}`, tx, y + 88);
}

export function drawSlide(
  canvas: HTMLCanvasElement,
  slide: Slide,
  index: number,
  total: number,
  author: Author,
  theme: Theme
): void {
  canvas.width = SLIDE.width;
  canvas.height = SLIDE.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.fillStyle = theme.background;
  ctx.fillRect(0, 0, SLIDE.width, SLIDE.height);
  drawHeader(ctx, author, theme);

  // Body, vertically centred in the space between header and footer.
  const lh = slide.fontSize * LINE_HEIGHT;
  const gap = 1.1 * lh;
  const height = slide.blocks.reduce((h, b, i) => h + b.lines.length * lh + (i ? gap : 0), 0);
  const top = SLIDE.padding + SLIDE.header;
  const room = SLIDE.height - SLIDE.padding * 2 - SLIDE.header - SLIDE.footer;
  let y = top + Math.max((room - height) / 2, 0);
  ctx.fillStyle = theme.text;
  ctx.font = `${slide.fontSize}px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  slide.blocks.forEach((block, i) => {
    if (i) y += gap;
    for (const line of block.lines) {
      ctx.fillText(line, SLIDE.padding, y + (lh - slide.fontSize) / 2);
      y += lh;
    }
  });

  // Footer: handle on the left, slide number on the right.
  const fy = SLIDE.height - SLIDE.padding;
  ctx.textBaseline = 'alphabetic';
  ctx.font = `600 30px ${FONT}`;
  ctx.fillStyle = theme.muted;
  ctx.fillText(`x.com/${author.handle}`, SLIDE.padding, fy);
  ctx.textAlign = 'right';
  ctx.fillText(`${index + 1}/${total}`, SLIDE.width - SLIDE.padding, fy);
  // Progress bar along the bottom edge.
  ctx.fillStyle = theme.accent;
  ctx.globalAlpha = 0.85;
  ctx.fillRect(0, SLIDE.height - 10, (SLIDE.width * (index + 1)) / total, 10);
  ctx.globalAlpha = 1;
}

export function canvasToPng(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) return reject(new Error('could not render slide'));
      blob.arrayBuffer().then((buf) => resolve(new Uint8Array(buf)), reject);
    }, 'image/png');
  });
}
