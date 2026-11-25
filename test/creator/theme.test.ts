// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { colorRules } from '../../src/creator/theme';
import {
  contrast,
  GRADIENTS,
  paletteFrom,
  parseColor,
  PRESETS,
  resolveTheme,
  roleOf,
  scoped,
  themeCss,
} from '../../src/creator/theme/palette';

describe('colours', () => {
  it('parses rgb, rgba and hex', () => {
    expect(parseColor('rgb(0, 0, 0)')).toEqual({ r: 0, g: 0, b: 0, a: 1 });
    expect(parseColor('rgba(0,0,0,0.65)')).toEqual({ r: 0, g: 0, b: 0, a: 0.65 });
    expect(parseColor('#1d9bf0')).toEqual({ r: 29, g: 155, b: 240, a: 1 });
    expect(parseColor('#fff')).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(parseColor('var(--x)')).toBeNull();
  });

  it("knows the role of each of X's theme colours, in all three X themes", () => {
    for (const bg of ['rgb(0, 0, 0)', 'rgb(21, 32, 43)', 'rgb(255, 255, 255)']) expect(roleOf('background', bg)).toBe('bg');
    expect(roleOf('background', 'rgba(0, 0, 0, 0.65)')).toBe('header');
    expect(roleOf('background', 'rgb(22, 24, 28)')).toBe('surface');
    expect(roleOf('border', 'rgb(47, 51, 54)')).toBe('border');
    expect(roleOf('color', 'rgb(231, 233, 234)')).toBe('text');
    expect(roleOf('color', 'rgb(113, 118, 123)')).toBe('muted');
  });

  it("leaves X's accent colours and transparent fills alone", () => {
    expect(roleOf('background', 'rgb(29, 155, 240)')).toBeNull();
    expect(roleOf('background', 'rgba(0, 0, 0, 0)')).toBeNull();
    expect(roleOf('color', 'rgb(249, 24, 128)')).toBeNull();
  });
});

describe('palettes', () => {
  it('derives readable text from any background colour', () => {
    for (const bg of ['#000000', '#1e2a38', '#f4ecd8', '#ffffff', '#ff6b6b', '#2f9e44']) {
      const p = paletteFrom(bg);
      // WCAG AA: 4.5:1 for body text, 3:1 for secondary text.
      expect(contrast(parseColor(p.text)!, parseColor(p.bg)!)).toBeGreaterThan(4.5);
      expect(contrast(parseColor(p.muted)!, parseColor(p.bg)!)).toBeGreaterThan(3);
    }
  });

  it('has the presets and gradients the popup offers', () => {
    expect(PRESETS.map((p) => p.id)).toEqual(['midnight', 'ocean', 'forest', 'rose', 'sepia', 'slate']);
    expect(GRADIENTS.map((g) => g.id)).toEqual(['aurora', 'sunset', 'ocean', 'dusk', 'candy']);
    expect(PRESETS.find((p) => p.id === 'sepia')?.palette.dark).toBe(false);
  });
});

describe('resolveTheme', () => {
  const base = { theme: 'x', themeColor: '#1e2a38', backdrop: 'none', backdropDim: 55 };

  it("is off for X's own look", () => {
    expect(resolveTheme(base, null)).toBeNull();
  });

  it('resolves presets, custom colours, gradients and pictures', () => {
    expect(resolveTheme({ ...base, theme: 'midnight' }, null)?.palette.bg).toBe('#0b1020');
    expect(resolveTheme({ ...base, theme: 'custom', themeColor: '#336699' }, null)?.palette.bg).toBe('#336699');
    expect(resolveTheme({ ...base, backdrop: 'aurora' }, null)?.backdrop).toContain('linear-gradient');
    const pic = 'data:image/jpeg;base64,AAAA';
    expect(resolveTheme({ ...base, backdrop: 'image' }, pic)?.backdrop).toBe(`url("${pic}")`);
  });

  it('ignores a missing or unsafe picture, and clamps the dim', () => {
    expect(resolveTheme({ ...base, backdrop: 'image' }, null)).toBeNull();
    expect(resolveTheme({ ...base, backdrop: 'image' }, 'javascript:alert(1)')).toBeNull();
    expect(resolveTheme({ ...base, backdrop: 'image' }, 'data:image/png;base64,") ; x{')).toBeNull();
    expect(resolveTheme({ ...base, backdrop: 'dusk', backdropDim: 400 }, null)?.dim).toBe(90);
  });

  it('picks text that reads on a light gradient when X colours are kept', () => {
    expect(resolveTheme({ ...base, backdrop: 'candy' }, null)?.palette.dark).toBe(false);
    expect(resolveTheme({ ...base, backdrop: 'dusk' }, null)?.palette.dark).toBe(true);
  });
});

describe('themeCss', () => {
  const rules = [
    { selector: '.r-kemksi', prop: 'background-color', value: 'rgb(0, 0, 0)' },
    { selector: '.r-1kqtdi0', prop: 'border-color', value: 'rgb(47, 51, 54)' },
    { selector: '.r-1nao33i', prop: 'color', value: 'rgb(231, 233, 234)' },
    { selector: '.r-blue', prop: 'background-color', value: 'rgb(29, 155, 240)' },
    { selector: '.a, .b', prop: 'color', value: 'rgb(113, 118, 123)' },
  ];

  it("points each of X's theme rules at the theme's colour for that role", () => {
    const css = themeCss(resolveTheme({ theme: 'midnight', themeColor: '', backdrop: 'none', backdropDim: 55 }, null)!, rules);
    expect(css).toContain('html.bm-theme .r-kemksi { background-color: #0b1020 !important; }');
    expect(css).toMatch(/html\.bm-theme \.r-1kqtdi0 \{ border-color: #[0-9a-f]{6} !important; \}/);
    expect(css).toContain('html.bm-theme :is(.a, .b) { color:');
    expect(css).not.toContain('.r-blue');
  });

  it('makes the page see-through over a background, with a readable wash', () => {
    const css = themeCss(resolveTheme({ theme: 'midnight', themeColor: '', backdrop: 'aurora', backdropDim: 60 }, null)!, rules);
    expect(css).toContain('.r-kemksi { background-color: transparent !important; }');
    expect(css).toContain('linear-gradient(rgba(11, 16, 32, 0.6), rgba(11, 16, 32, 0.6)), linear-gradient(160deg');
  });

  it('also recolours inline styles, without confusing background-color with color', () => {
    const css = themeCss(resolveTheme({ theme: 'sepia', themeColor: '', backdrop: 'none', backdropDim: 55 }, null)!, []);
    expect(css).toContain(
      'html.bm-theme :is([style^="color: rgb(231, 233, 234)"], [style*=" color: rgb(231, 233, 234)"]) { color: #3b2f1e !important; }'
    );
    expect(css).toContain('html.bm-theme [style*="background-color: rgb(0, 0, 0)"] { background-color: #f4ecd8 !important; }');
    // The attribute rules really match the right elements.
    const style = document.createElement('style');
    style.textContent = css;
    document.head.append(style);
    document.documentElement.classList.add('bm-theme');
    document.body.innerHTML = `<p id="t" style="color: rgb(231, 233, 234);">post</p>
      <div style="color: rgb(1, 2, 3);"><p id="b" style="background-color: rgb(231, 233, 234);">x</p></div>`;
    expect(getComputedStyle(document.getElementById('t')!).color).toBe('rgb(59, 47, 30)');
    expect(getComputedStyle(document.getElementById('b')!).color).toBe('rgb(1, 2, 3)'); // not matched by the color rule
    style.remove();
    document.documentElement.classList.remove('bm-theme');
  });

  it('keeps dialogs, menus and the photo viewer solid over a background', () => {
    const withBackdrop = themeCss(resolveTheme({ theme: 'midnight', themeColor: '', backdrop: 'image', backdropDim: 55 }, 'data:image/png;base64,AAAA')!, rules);
    expect(withBackdrop).toContain('.r-kemksi { background-color: transparent !important; }');
    expect(withBackdrop).toMatch(/\[aria-modal="true"\].*:is\(\.r-kemksi\) \{ background-color: #0b1020 !important; \}/);
    // Later in the sheet, and more specific, so it wins inside a layer.
    expect(withBackdrop.lastIndexOf(':is(.r-kemksi)')).toBeGreaterThan(withBackdrop.indexOf('.r-kemksi { background-color: transparent'));
    // A translucent panel behind the feed column, after the page rules so it wins.
    expect(withBackdrop).toContain('html.bm-theme [data-testid="primaryColumn"] { background-color: rgba(11, 16, 32, 0.78) !important; }');
    expect(withBackdrop.indexOf('primaryColumn')).toBeGreaterThan(withBackdrop.indexOf('.r-kemksi { background-color: transparent'));
    const firmer = themeCss(resolveTheme({ theme: 'midnight', themeColor: '', backdrop: 'aurora', backdropDim: 90 }, null)!, rules);
    expect(firmer).toContain('rgba(11, 16, 32, 0.9) !important');
    // Without a background nothing is see-through, so no extra rules.
    const plain = themeCss(resolveTheme({ theme: 'midnight', themeColor: '', backdrop: 'none', backdropDim: 55 }, null)!, rules);
    expect(plain).not.toContain('aria-modal');
  });

  it('scopes selectors safely', () => {
    expect(scoped('.x')).toBe('html.bm-theme .x');
    expect(scoped('.x, .y')).toBe('html.bm-theme :is(.x, .y)');
    expect(scoped('.x::placeholder, .y::placeholder')).toBeNull();
  });
});

describe('colorRules', () => {
  it("finds X's theme colours in a real stylesheet, including inside @media", () => {
    const style = document.createElement('style');
    style.textContent = `
      .r-kemksi { background-color: rgb(0, 0, 0); }
      .r-1kqtdi0 { border-bottom-color: rgb(47, 51, 54); }
      .r-blue { background-color: rgb(29, 155, 240); }
      @media (min-width: 500px) { .r-wide { color: rgb(113, 118, 123); } }`;
    document.head.append(style);
    const found = colorRules(style.sheet!.cssRules).map((r) => `${r.selector} ${r.prop}`);
    expect(found).toEqual(['.r-kemksi background-color', '.r-1kqtdi0 border-bottom-color', '.r-wide color']);
  });
});
