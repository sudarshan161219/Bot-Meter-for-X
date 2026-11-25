// Themes for X: colour logic (pure, unit-tested). X's signed-in web app paints
// its colours with atomic CSS classes (".r-kemksi { background-color: rgb(0,0,0) }")
// whose values come from its three built-in themes. A colour in a rule tells us
// its role (page background, card, border, text…), so each rule can be pointed at
// the same role in the reader's theme, whatever X theme they use.

export type Role = 'bg' | 'surface' | 'header' | 'border' | 'text' | 'muted';

export interface Palette {
  /** Page background. */
  bg: string;
  /** Cards, inputs, menus, hover areas. */
  surface: string;
  border: string;
  text: string;
  muted: string;
  dark: boolean;
}

export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

export function parseColor(value: string): Rgba | null {
  const v = value.trim().toLowerCase();
  const m = v.match(/^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)(?:[\s,/]+([\d.]+%?))?\s*\)$/);
  if (m) {
    const alpha = m[4] === undefined ? 1 : m[4].endsWith('%') ? Number.parseFloat(m[4]) / 100 : Number(m[4]);
    return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]), a: alpha };
  }
  const h = v.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/)?.[1];
  if (h) {
    const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h;
    return { r: parseInt(full.slice(0, 2), 16), g: parseInt(full.slice(2, 4), 16), b: parseInt(full.slice(4, 6), 16), a: 1 };
  }
  return null;
}

const key = ({ r, g, b }: Rgba): string => `${r},${g},${b}`;

// X's palettes: light, dim and lights out, by property kind.
const X_BACKGROUND: Record<string, 'bg' | 'surface'> = {
  '0,0,0': 'bg',
  '21,32,43': 'bg',
  '255,255,255': 'bg',
  '22,24,28': 'surface',
  '24,24,24': 'surface',
  '32,35,39': 'surface',
  '30,39,50': 'surface',
  '39,51,64': 'surface',
  '247,249,249': 'surface',
  '239,243,244': 'surface',
};
const X_BORDER = new Set(['47,51,54', '56,68,77', '66,83,100', '239,243,244', '207,217,222', '32,35,39', '22,24,28']);
const X_TEXT: Record<string, 'text' | 'muted'> = {
  '231,233,234': 'text',
  '247,249,249': 'text',
  '15,20,25': 'text',
  '113,118,123': 'muted',
  '139,152,165': 'muted',
  '83,100,115': 'muted',
};

export type PropKind = 'background' | 'border' | 'color';

export function propKind(prop: string): PropKind | null {
  if (prop === 'background-color') return 'background';
  if (prop === 'color') return 'color';
  if (/^border(-(top|right|bottom|left))?-color$/.test(prop)) return 'border';
  return null;
}

/** What a colour in one of X's rules is for, or null when it isn't a theme colour (e.g. X's blue). */
export function roleOf(kind: PropKind, value: string): Role | null {
  const c = parseColor(value);
  if (!c || c.a === 0) return null;
  const k = key(c);
  if (kind === 'background') {
    const role = X_BACKGROUND[k];
    if (!role) return null;
    // Translucent page colour = the sticky, blurred headers.
    if (role === 'bg' && c.a < 1) return c.a >= 0.5 ? 'header' : null;
    return c.a < 1 ? null : role;
  }
  if (kind === 'border') return X_BORDER.has(k) ? 'border' : null;
  return X_TEXT[k] ?? null;
}

// --- palettes ---

const hex = (c: Rgba): string => `#${[c.r, c.g, c.b].map((n) => Math.round(n).toString(16).padStart(2, '0')).join('')}`;
const mix = (a: Rgba, b: Rgba, t: number): Rgba => ({
  r: a.r + (b.r - a.r) * t,
  g: a.g + (b.g - a.g) * t,
  b: a.b + (b.b - a.b) * t,
  a: 1,
});

/** WCAG relative luminance. */
export function luminance({ r, g, b }: Rgba): number {
  const lin = (v: number): number => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export const contrast = (a: Rgba, b: Rgba): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};

const LIGHT_TEXT: Rgba = { r: 247, g: 249, b: 249, a: 1 };
const DARK_TEXT: Rgba = { r: 15, g: 20, b: 25, a: 1 };

/** A full palette from one background colour: cards and borders a step away, and whichever text reads best. */
export function paletteFrom(background: string): Palette {
  const bg = parseColor(background) ?? { r: 21, g: 32, b: 43, a: 1 };
  const dark = contrast(LIGHT_TEXT, bg) >= contrast(DARK_TEXT, bg);
  const toward = dark ? { r: 255, g: 255, b: 255, a: 1 } : { r: 0, g: 0, b: 0, a: 1 };
  const text = dark ? LIGHT_TEXT : DARK_TEXT;
  return {
    bg: hex(bg),
    surface: hex(mix(bg, toward, dark ? 0.06 : 0.04)),
    border: hex(mix(bg, toward, dark ? 0.18 : 0.12)),
    text: hex(text),
    // Secondary text: as soft as possible while still reading (3.2:1 or better).
    muted: hex([0.55, 0.62, 0.7, 0.78, 0.86].map((t) => mix(bg, text, t)).find((c) => contrast(c, bg) >= 3.2) ?? text),
    dark,
  };
}

export interface Preset {
  id: string;
  name: string;
  palette: Palette;
}

const preset = (id: string, name: string, bg: string, tweaks: Partial<Palette> = {}): Preset => ({
  id,
  name,
  palette: { ...paletteFrom(bg), ...tweaks },
});

export const PRESETS: readonly Preset[] = [
  preset('midnight', 'Midnight', '#0b1020'),
  preset('ocean', 'Ocean', '#0b1d26'),
  preset('forest', 'Forest', '#0f1a14'),
  preset('rose', 'Rose', '#1f1418'),
  preset('sepia', 'Sepia', '#f4ecd8', { text: '#3b2f1e', muted: '#7a6a4f' }),
  preset('slate', 'Slate', '#eef1f5'),
];

export interface Gradient {
  id: string;
  name: string;
  css: string;
  dark: boolean;
}

export const GRADIENTS: readonly Gradient[] = [
  { id: 'aurora', name: 'Aurora', css: 'linear-gradient(160deg, #0f2027 0%, #203a43 50%, #2c5364 100%)', dark: true },
  { id: 'sunset', name: 'Sunset', css: 'linear-gradient(160deg, #1a0b2e 0%, #4a1942 55%, #c94b4b 100%)', dark: true },
  { id: 'ocean', name: 'Deep sea', css: 'linear-gradient(160deg, #021b2e 0%, #0a4d68 60%, #088395 100%)', dark: true },
  { id: 'dusk', name: 'Dusk', css: 'linear-gradient(160deg, #141e30 0%, #243b55 100%)', dark: true },
  { id: 'candy', name: 'Candy', css: 'linear-gradient(135deg, #fbc2eb 0%, #a6c1ee 100%)', dark: false },
];

// --- the settings, resolved ---

export interface ThemeSettings {
  /** 'x' (X's own colours), a preset id, or 'custom'. */
  theme: string;
  /** Background colour for 'custom'. */
  themeColor: string;
  /** 'none', a gradient id, or 'image'. */
  backdrop: string;
  /** 0–90: how much the page colour covers a gradient or image, so posts stay readable. */
  backdropDim: number;
}

export interface ResolvedTheme {
  palette: Palette;
  /** CSS background for the page behind the feed, or null for a plain colour. */
  backdrop: string | null;
  dim: number;
}

const DARK_FALLBACK = paletteFrom('#0b1020');
const LIGHT_FALLBACK = paletteFrom('#f7f9f9');

/** The theme to paint, or null for X's own look. `image` is the uploaded picture (a data: URL), if any. */
export function resolveTheme(s: ThemeSettings, image: string | null): ResolvedTheme | null {
  const chosen =
    s.theme === 'custom' ? paletteFrom(s.themeColor) : PRESETS.find((p) => p.id === s.theme)?.palette ?? null;
  const gradient = GRADIENTS.find((g) => g.id === s.backdrop) ?? null;
  // The whole value is checked: it goes inside url("…") in CSS.
  const picture = s.backdrop === 'image' && image && /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/]+=*$/.test(image) ? image : null;
  const backdrop = gradient ? gradient.css : picture ? `url("${picture}")` : null;
  if (!chosen && !backdrop) return null;
  // A backdrop with X's own colours: pick text that reads on it (pictures get a dark wash).
  const palette = chosen ?? (gradient && !gradient.dark ? LIGHT_FALLBACK : DARK_FALLBACK);
  const dim = Math.min(Math.max(Number.isFinite(s.backdropDim) ? s.backdropDim : 55, 0), 90);
  return { palette, backdrop, dim };
}

// --- CSS ---

export interface ColorRule {
  selector: string;
  prop: string;
  value: string;
}

const alpha = (color: string, a: number): string => {
  const c = parseColor(color);
  return c ? `rgba(${c.r}, ${c.g}, ${c.b}, ${a})` : color;
};

/** The stylesheet that repaints X: base page styles plus one override per matching X rule. */
export function themeCss(theme: ResolvedTheme, rules: readonly ColorRule[]): string {
  const { palette: p, backdrop, dim } = theme;
  const wash = alpha(p.bg, dim / 100);
  // Over a backdrop the page colour turns see-through; cards and headers stay mostly opaque.
  const roles: Record<Role, string> = {
    bg: backdrop ? 'transparent' : p.bg,
    surface: backdrop ? alpha(p.surface, 0.82) : p.surface,
    header: alpha(p.bg, backdrop ? 0.72 : 0.85),
    border: p.border,
    text: p.text,
    muted: p.muted,
  };
  const lines = [
    `html.bm-theme, html.bm-theme body { color-scheme: ${p.dark ? 'dark' : 'light'}; }`,
    backdrop
      ? `html.bm-theme body { background: linear-gradient(${wash}, ${wash}), ${backdrop} center / cover fixed no-repeat !important; background-color: ${p.bg} !important; color: ${p.text} !important; }`
      : `html.bm-theme body { background: ${p.bg} !important; color: ${p.text} !important; }`,
    `html.bm-theme body { scrollbar-color: ${p.border} ${p.bg} !important; }`,
  ];
  for (const r of rules) {
    const kind = propKind(r.prop);
    const role = kind && roleOf(kind, r.value);
    const selector = scoped(r.selector);
    if (role && selector) lines.push(`${selector} { ${r.prop}: ${roles[role]} !important; }`);
  }
  lines.push(...inlineCss(roles));
  return lines.join('\n');
}

/**
 * X also sets some colours in style="" attributes (post text, names), which
 * class overrides can't reach. Chrome writes those as "color: rgb(r, g, b)", so
 * they're matched by attribute. A plain colour must start the attribute or follow
 * a space, so "background-color: …" never matches the "color: …" rule.
 */
function inlineCss(roles: Record<Role, string>): string[] {
  const out: string[] = [];
  const rgb = (k: string): string => `rgb(${k.split(',').join(', ')})`;
  for (const [k, role] of Object.entries(X_TEXT)) {
    const v = `color: ${rgb(k)}`;
    out.push(`html.bm-theme :is([style^="${v}"], [style*=" ${v}"]) { color: ${roles[role]} !important; }`);
  }
  for (const [k, role] of Object.entries(X_BACKGROUND)) {
    out.push(`html.bm-theme [style*="background-color: ${rgb(k)}"] { background-color: ${roles[role]} !important; }`);
  }
  for (const k of X_BORDER) {
    out.push(`html.bm-theme [style*="border-color: ${rgb(k)}"] { border-color: ${roles.border} !important; }`);
  }
  return out;
}

/** Limits a selector to themed pages. Lists are wrapped whole; :is() can't hold pseudo-elements, so those lists are skipped. */
export function scoped(selector: string): string | null {
  const s = selector.trim();
  if (!s) return null;
  if (!s.includes(',')) return `html.bm-theme ${s}`;
  return s.includes('::') ? null : `html.bm-theme :is(${s})`;
}
