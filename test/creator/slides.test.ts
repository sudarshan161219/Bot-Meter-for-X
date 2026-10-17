import { describe, expect, it } from 'vitest';
import { BODY_HEIGHT, FONT_SIZES, LINE_HEIGHT, paginate, themeColors, wrapText } from '../../src/creator/thread-exporter/slides';

// Every character is half the font size wide (a rough average for sans-serif text).
const measure = (text: string, size: number): number => Array.from(text).length * size * 0.5;

describe('wrapText', () => {
  it('wraps on spaces, keeps line breaks, and breaks words too long for a line', () => {
    expect(wrapText('aaa bbb ccc', 10, 30, measure)).toEqual(['aaa', 'bbb', 'ccc']);
    expect(wrapText('aa bb\n\ncc', 10, 100, measure)).toEqual(['aa bb', '', 'cc']);
    expect(wrapText('abcdefghij', 10, 25, measure)).toEqual(['abcde', 'fghij']);
  });
});

describe('paginate', () => {
  const height = (lines: number, size: number): number => lines * size * LINE_HEIGHT;

  it('puts short posts together and grows the text to fill the slide', () => {
    const slides = paginate(['One.', 'Two.', 'Three.'], measure);
    expect(slides).toHaveLength(1);
    expect(slides[0]?.blocks.map((b) => b.post)).toEqual([0, 1, 2]);
    expect(slides[0]?.fontSize).toBe(FONT_SIZES[0]);
  });

  it('starts a new slide when the next post does not fit', () => {
    const long = 'word '.repeat(140).trim();
    const slides = paginate([long, long, 'short'], measure);
    expect(slides.length).toBeGreaterThanOrEqual(2);
    expect(slides.flatMap((s) => s.blocks.map((b) => b.post))).toEqual([0, 1, 2]);
    for (const s of slides) {
      const used = s.blocks.reduce((h, b, i) => h + height(b.lines.length, s.fontSize) + (i ? 1.1 * s.fontSize * LINE_HEIGHT : 0), 0);
      expect(used).toBeLessThanOrEqual(BODY_HEIGHT);
    }
  });

  it('splits a post too long for any slide across several, marking the continuation', () => {
    const huge = 'word '.repeat(1200).trim();
    const slides = paginate([huge], measure);
    expect(slides.length).toBeGreaterThan(1);
    expect(slides.map((s) => s.blocks[0]?.continued)).toEqual(slides.map((_, i) => i > 0));
    expect(slides.flatMap((s) => s.blocks[0]?.lines ?? []).join(' ')).toBe(huge);
  });
});

describe('themeColors', () => {
  it('picks readable text for brand colors', () => {
    expect(themeColors('brand', '#ffd400').text).toBe('#0f1419');
    expect(themeColors('brand', '#5b21b6').text).toBe('#ffffff');
    expect(themeColors('brand', 'not-a-color').background).toBe('#1d9bf0');
    expect(themeColors('dark').background).toBe('#000000');
  });
});
