// Carousel layout: splits a thread into 1080x1350 slides, one or more posts per
// slide, with the text size fitted to how much text a slide holds. Pure: text
// width comes from a `measure` function (canvas measureText in the browser, a
// stub in tests).

export const SLIDE = { width: 1080, height: 1350, padding: 88, header: 150, footer: 80 } as const;
export const BODY_WIDTH = SLIDE.width - SLIDE.padding * 2;
export const BODY_HEIGHT = SLIDE.height - SLIDE.padding * 2 - SLIDE.header - SLIDE.footer;
/** Text sizes to try, largest first; posts are packed at PACK_SIZE, then each slide grows to fit. */
export const FONT_SIZES = [64, 56, 50, 44, 38, 34] as const;
const PACK_SIZE = 44;
const SMALLEST = 34;
export const LINE_HEIGHT = 1.4;
/** Space between two posts on one slide, in lines. */
const GAP = 1.1;

export type Measure = (text: string, fontSize: number) => number;

/** Word-wraps text to a width, keeping the post's own line breaks; very long words are broken. */
export function wrapText(text: string, fontSize: number, maxWidth: number, measure: Measure): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    if (!paragraph.trim()) {
      if (lines.length && lines[lines.length - 1] !== '') lines.push('');
      continue;
    }
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (measure(candidate, fontSize) <= maxWidth) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);
      // A word wider than the line: break it by characters.
      line = '';
      for (const ch of Array.from(word)) {
        if (line && measure(line + ch, fontSize) > maxWidth) {
          lines.push(line);
          line = '';
        }
        line += ch;
      }
    }
    if (line) lines.push(line);
  }
  while (lines[lines.length - 1] === '') lines.pop();
  return lines;
}

export interface Block {
  /** Index of the post in the thread. */
  post: number;
  lines: string[];
  /** Part of a post too long for one slide; true on every part after the first. */
  continued: boolean;
}

export interface Slide {
  blocks: Block[];
  fontSize: number;
}

const lineHeight = (fontSize: number): number => fontSize * LINE_HEIGHT;
const capacity = (fontSize: number): number => Math.floor(BODY_HEIGHT / lineHeight(fontSize));
const heightOf = (blocks: readonly { lines: readonly string[] }[], fontSize: number): number =>
  blocks.reduce((h, b, i) => h + b.lines.length * lineHeight(fontSize) + (i ? GAP * lineHeight(fontSize) : 0), 0);

export function paginate(texts: readonly string[], measure: Measure): Slide[] {
  const wrapAt = (fontSize: number) => (text: string) => wrapText(text, fontSize, BODY_WIDTH, measure);
  const slides: Slide[] = [];
  let current: { post: number; text: string }[] = [];

  const fits = (items: { text: string }[], fontSize: number): boolean =>
    heightOf(items.map((i) => ({ lines: wrapAt(fontSize)(i.text) })), fontSize) <= BODY_HEIGHT;

  const flush = (): void => {
    if (!current.length) return;
    // Grow the text as large as the slide allows.
    const size = FONT_SIZES.find((s) => fits(current, s)) ?? PACK_SIZE;
    slides.push({ fontSize: size, blocks: current.map((i) => ({ post: i.post, lines: wrapAt(size)(i.text), continued: false })) });
    current = [];
  };

  texts.forEach((text, post) => {
    if (fits([...current, { post, text }], PACK_SIZE)) {
      current.push({ post, text });
      return;
    }
    flush();
    if (fits([{ text }], SMALLEST)) {
      current.push({ post, text });
      return;
    }
    // Too long for one slide even at the smallest size: split it across slides.
    const lines = wrapAt(SMALLEST)(text);
    const per = capacity(SMALLEST);
    for (let i = 0; i < lines.length; i += per) {
      slides.push({ fontSize: SMALLEST, blocks: [{ post, lines: lines.slice(i, i + per), continued: i > 0 }] });
    }
  });
  flush();
  return slides;
}

// --- themes ---

export type ThemeName = 'light' | 'dark' | 'brand';

export interface Theme {
  background: string;
  text: string;
  muted: string;
  accent: string;
}

/** Relative luminance (WCAG) of a #rrggbb color. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export const DEFAULT_BRAND = '#1d9bf0';

export function themeColors(name: ThemeName, brand: string = DEFAULT_BRAND): Theme {
  if (name === 'dark') return { background: '#000000', text: '#e7e9ea', muted: '#71767b', accent: '#1d9bf0' };
  if (name === 'brand') {
    const bg = /^#[0-9a-f]{6}$/i.test(brand) ? brand : DEFAULT_BRAND;
    // Dark text on light colors, white text on dark ones.
    const light = luminance(bg) > 0.4;
    return light
      ? { background: bg, text: '#0f1419', muted: 'rgba(15, 20, 25, 0.68)', accent: '#0f1419' }
      : { background: bg, text: '#ffffff', muted: 'rgba(255, 255, 255, 0.75)', accent: '#ffffff' };
  }
  return { background: '#ffffff', text: '#0f1419', muted: '#536471', accent: '#1d9bf0' };
}
