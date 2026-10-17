// Export preview modal. Lives in a shadow root so X's styles and ours never mix.
// Updates live while the reader scrolls and more of the thread loads.

import { allowed } from '../entitlements';
import { fail } from '../log';
import type { Tweet } from '../types';
import { fileStem, toMarkdown, toPlainText } from './formats';
import { canvasToPng, drawSlide, layoutSlides, loadAvatar, type Author } from './render';
import { DEFAULT_BRAND, themeColors, type ThemeName } from './slides';
import type { Thread } from './thread';
import { createZip } from './zip';

export type Format = 'markdown' | 'carousel' | 'pdf' | 'text';

export interface ModalDeps {
  getThread(): Thread | null;
  quoted(id: string): Tweet | undefined;
  /** Called when more posts are captured; returns an unsubscribe function. */
  onChange(fn: () => void): () => void;
  openPrint(tweets: Tweet[], quoted: Tweet[]): Promise<boolean>;
}

interface Prefs {
  format: Format;
  theme: ThemeName;
  brand: string;
}

const FORMATS: { id: Format; label: string }[] = [
  { id: 'markdown', label: 'Markdown' },
  { id: 'carousel', label: 'Image carousel' },
  { id: 'pdf', label: 'PDF' },
  { id: 'text', label: 'Copy text' },
];
const PREFS_KEY = 'threadExportPrefs';

const STYLE = `
:host { all: initial; }
[hidden] { display: none !important; }
.overlay { position: fixed; inset: 0; z-index: 2147483000; display: grid; place-items: center; padding: 16px;
  background: rgba(91, 112, 131, 0.4); font: 15px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
.dialog { --bg: #fff; --fg: #0f1419; --muted: #536471; --line: #eff3f4; --field: #f7f9f9; --accent: #1d9bf0;
  width: min(760px, 100%); max-height: min(90vh, 900px); display: flex; flex-direction: column;
  background: var(--bg); color: var(--fg); border-radius: 16px; box-shadow: 0 8px 28px rgba(0,0,0,.25); overflow: hidden; }
.dialog.dark { --bg: #000; --fg: #e7e9ea; --muted: #71767b; --line: #2f3336; --field: #16181c; box-shadow: 0 0 0 1px #2f3336; }
header { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 18px; border-bottom: 1px solid var(--line); }
h2 { margin: 0; font-size: 19px; }
.close { width: 34px; height: 34px; border-radius: 50%; border: 0; background: none; color: var(--fg); font-size: 22px; cursor: pointer; }
.close:hover { background: var(--field); }
.status { padding: 10px 18px 0; color: var(--muted); font-size: 14px; }
.status b { color: var(--fg); }
.status .warn { display: block; margin-top: 4px; color: #e8590c; }
.tabs { display: flex; flex-wrap: wrap; gap: 8px; padding: 12px 18px; }
.tabs button, .themes button { padding: 6px 14px; border-radius: 999px; border: 1px solid var(--line); background: none; color: var(--fg);
  font: inherit; font-size: 14px; font-weight: 600; cursor: pointer; }
.tabs button[aria-pressed="true"], .themes button[aria-pressed="true"] { background: var(--fg); color: var(--bg); border-color: var(--fg); }
.tabs button:disabled, .themes button:disabled { opacity: .45; cursor: not-allowed; }
.themes { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 0 18px 10px; font-size: 14px; color: var(--muted); }
.themes input[type=color] { width: 34px; height: 30px; padding: 0; border: 1px solid var(--line); border-radius: 8px; background: none; cursor: pointer; }
.pro { margin-left: 4px; padding: 0 6px; border-radius: 6px; background: var(--accent); color: #fff; font-size: 11px; }
.preview { flex: 1; min-height: 160px; overflow: auto; margin: 0 18px; border: 1px solid var(--line); border-radius: 12px; background: var(--field); }
pre { margin: 0; padding: 14px; white-space: pre-wrap; word-break: break-word; font: 13px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.slides { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px; padding: 14px; }
.slides canvas { width: 100%; height: auto; border-radius: 8px; box-shadow: 0 0 0 1px var(--line); }
.note { padding: 14px; color: var(--muted); }
.note p { margin: 0 0 8px; }
footer { display: flex; align-items: center; justify-content: flex-end; gap: 10px; padding: 14px 18px; }
.message { margin-right: auto; color: var(--muted); font-size: 14px; }
.primary, .secondary { padding: 8px 18px; border-radius: 999px; font: inherit; font-weight: 700; cursor: pointer; }
.primary { border: 0; background: var(--fg); color: var(--bg); }
.primary:disabled { opacity: .5; cursor: default; }
.secondary { border: 1px solid var(--line); background: none; color: var(--fg); }
`;

/** X's own light/dark theme, from its page background (it doesn't follow the OS setting). */
function pageIsDark(): boolean {
  const m = getComputedStyle(document.body).backgroundColor.match(/\d+(\.\d+)?/g)?.map(Number) ?? [255, 255, 255];
  const [r = 255, g = 255, b = 255] = m;
  return 0.299 * r + 0.587 * g + 0.114 * b < 128;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...children: (Node | string)[]): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  Object.assign(node, props);
  node.append(...children);
  return node;
}

function download(data: BlobPart, type: string, name: string): void {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = el('a', { href: url, download: name });
  a.style.display = 'none';
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Older fallback for pages where the async clipboard is blocked.
    const area = el('textarea', { value: text });
    document.body.append(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  }
}

async function loadPrefs(): Promise<Prefs> {
  const fallback: Prefs = { format: 'markdown', theme: 'light', brand: DEFAULT_BRAND };
  try {
    const stored = (await chrome.storage.local.get(PREFS_KEY))[PREFS_KEY] as Partial<Prefs> | undefined;
    return {
      format: FORMATS.some((f) => f.id === stored?.format) ? (stored?.format as Format) : fallback.format,
      theme: stored?.theme === 'dark' || stored?.theme === 'brand' ? stored.theme : 'light',
      brand: typeof stored?.brand === 'string' && /^#[0-9a-f]{6}$/i.test(stored.brand) ? stored.brand : fallback.brand,
    };
  } catch {
    return fallback;
  }
}

let open: (() => void) | null = null;

export async function openExportModal(deps: ModalDeps): Promise<void> {
  if (open) return; // already showing
  const prefs = await loadPrefs();
  const host = el('div');
  host.setAttribute('data-creator-tools', 'export');
  const root = host.attachShadow({ mode: 'open' });
  root.append(el('style', { textContent: STYLE }));

  const title = el('h2', { id: 'title', textContent: 'Export thread' });
  const closeButton = el('button', { className: 'close', type: 'button', title: 'Close', textContent: '×' });
  closeButton.setAttribute('aria-label', 'Close');
  const status = el('div', { className: 'status' });
  const tabs = el('div', { className: 'tabs' });
  const themes = el('div', { className: 'themes' });
  const preview = el('div', { className: 'preview' });
  const message = el('span', { className: 'message' });
  message.setAttribute('role', 'status');
  const primary = el('button', { className: 'primary', type: 'button' });
  const cancel = el('button', { className: 'secondary', type: 'button', textContent: 'Close' });
  const dialog = el(
    'div',
    { className: `dialog${pageIsDark() ? ' dark' : ''}` },
    el('header', {}, title, closeButton),
    status,
    tabs,
    themes,
    preview,
    el('footer', {}, message, cancel, primary)
  );
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'title');
  dialog.tabIndex = -1;
  const overlay = el('div', { className: 'overlay' }, dialog);
  root.append(overlay);
  document.body.append(host);

  let avatar: ImageBitmap | null = null;
  let avatarFor: string | null = null;
  let canvases: HTMLCanvasElement[] = [];
  let lastKey = '';
  let busy = false;

  const close = (): void => {
    unsubscribe();
    document.removeEventListener('keydown', onKey, true);
    host.remove();
    open = null;
  };
  open = close;
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    }
  };
  document.addEventListener('keydown', onKey, true);
  closeButton.addEventListener('click', close);
  cancel.addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  const savePrefs = (): void => {
    chrome.storage.local.set({ [PREFS_KEY]: prefs }).catch(() => {});
  };

  for (const f of FORMATS) {
    const b = el('button', { type: 'button', textContent: f.label });
    b.dataset.format = f.id;
    b.addEventListener('click', () => {
      prefs.format = f.id;
      savePrefs();
      render(true);
    });
    tabs.append(b);
  }

  const themeButtons: HTMLButtonElement[] = [];
  const colorInput = el('input', { type: 'color', value: prefs.brand, title: 'Brand color' });
  themes.append('Theme:');
  for (const name of ['light', 'dark', 'brand'] as const) {
    const locked = name !== 'light' && !allowed('carouselThemes');
    const b = el('button', { type: 'button', textContent: name[0]?.toUpperCase() + name.slice(1), disabled: locked });
    if (locked) b.append(el('span', { className: 'pro', textContent: 'Pro' }));
    b.dataset.theme = name;
    b.addEventListener('click', () => {
      prefs.theme = name;
      savePrefs();
      render(true);
    });
    themeButtons.push(b);
    themes.append(b);
  }
  colorInput.addEventListener('input', () => {
    prefs.brand = colorInput.value;
    prefs.theme = 'brand';
    savePrefs();
    render(true);
  });
  themes.append(colorInput);

  primary.addEventListener('click', () => {
    void act();
  });

  const unsubscribe = deps.onChange(() => render(false));

  function render(force: boolean): void {
    try {
      const thread = deps.getThread();
      const tweets = thread?.tweets ?? [];
      const key = `${prefs.format}|${prefs.theme}|${prefs.brand}|${tweets.map((t) => t.id).join(',')}`;
      if (!force && key === lastKey) return;
      lastKey = key;

      for (const b of tabs.querySelectorAll<HTMLButtonElement>('button')) b.setAttribute('aria-pressed', String(b.dataset.format === prefs.format));
      for (const b of themeButtons) b.setAttribute('aria-pressed', String(b.dataset.theme === prefs.theme));
      themes.hidden = prefs.format !== 'carousel';

      const first = tweets[0];
      status.replaceChildren();
      if (first) {
        status.append(el('b', { textContent: `${tweets.length} post${tweets.length === 1 ? '' : 's'}` }), ` by @${first.authorHandle} captured. `);
        status.append('If the thread continues, scroll down on the page to load the rest; this updates as you scroll.');
        if (thread?.missingStart) status.append(el('span', { className: 'warn', textContent: "The thread's first post isn't loaded. Open it and export from there." }));
      } else {
        status.append('Scroll to load the full thread.');
      }

      const quotedPosts = (id: string): Tweet | undefined => deps.quoted(id);
      preview.replaceChildren();
      primary.disabled = !first || busy;
      if (prefs.format === 'markdown') {
        preview.append(el('pre', { textContent: toMarkdown(tweets, { quoted: quotedPosts }) }));
        primary.textContent = 'Download .md';
      } else if (prefs.format === 'text') {
        preview.append(el('pre', { textContent: toPlainText(tweets, { quoted: quotedPosts }) }));
        primary.textContent = 'Copy to clipboard';
      } else if (prefs.format === 'pdf') {
        preview.append(
          el(
            'div',
            { className: 'note' },
            el('p', { textContent: 'Opens the thread in a clean reading layout in a new tab, with your browser’s print dialog.' }),
            el('p', { textContent: 'Choose “Save as PDF” as the destination. Text stays selectable, and images and links are kept.' })
          )
        );
        primary.textContent = 'Open PDF view';
      } else {
        renderSlides(tweets);
        primary.textContent = 'Download .zip';
      }
    } catch (error) {
      fail('thread-exporter', error);
    }
  }

  function renderSlides(tweets: Tweet[]): void {
    const first = tweets[0];
    const grid = el('div', { className: 'slides' });
    preview.append(grid);
    canvases = [];
    if (!first) return;
    if (avatarFor !== first.authorAvatar) {
      avatarFor = first.authorAvatar;
      void loadAvatar(first.authorAvatar).then((bitmap) => {
        avatar = bitmap;
        if (bitmap) render(true);
      });
    }
    const author: Author = { name: first.authorName, handle: first.authorHandle, verified: first.verified, avatar };
    const theme = themeColors(prefs.theme === 'light' || allowed('carouselThemes') ? prefs.theme : 'light', prefs.brand);
    const slides = layoutSlides(tweets);
    slides.forEach((slide, i) => {
      const canvas = el('canvas');
      drawSlide(canvas, slide, i, slides.length, author, theme);
      canvas.setAttribute('aria-label', `Slide ${i + 1} of ${slides.length}`);
      canvases.push(canvas);
      grid.append(canvas);
    });
  }

  async function act(): Promise<void> {
    const thread = deps.getThread();
    const tweets = thread?.tweets ?? [];
    if (!tweets.length || busy) return;
    const quotedPosts = (id: string): Tweet | undefined => deps.quoted(id);
    busy = true;
    primary.disabled = true;
    message.textContent = '';
    try {
      const stem = fileStem(tweets);
      if (prefs.format === 'markdown') {
        download(toMarkdown(tweets, { quoted: quotedPosts }), 'text/markdown;charset=utf-8', `${stem}.md`);
        message.textContent = 'Downloaded.';
      } else if (prefs.format === 'text') {
        message.textContent = (await copyText(toPlainText(tweets, { quoted: quotedPosts }))) ? 'Copied to clipboard.' : 'Could not copy.';
      } else if (prefs.format === 'pdf') {
        const quoted = tweets.flatMap((t) => (t.quoted ? [deps.quoted(t.quoted)].filter((q): q is Tweet => !!q) : []));
        message.textContent = (await deps.openPrint(tweets, quoted)) ? 'Opened in a new tab.' : 'Could not open the PDF view.';
      } else {
        message.textContent = 'Rendering…';
        const files = [];
        for (const [i, canvas] of canvases.entries()) {
          files.push({ name: `${stem}-${String(i + 1).padStart(2, '0')}.png`, data: await canvasToPng(canvas) });
        }
        const zip = createZip(files);
        download(zip.slice().buffer, 'application/zip', `${stem}-carousel.zip`);
        message.textContent = `Downloaded ${files.length} slide${files.length === 1 ? '' : 's'}.`;
      }
    } catch (error) {
      message.textContent = 'Something went wrong. See the console for details.';
      fail('thread-exporter', error);
    } finally {
      busy = false;
      primary.disabled = false;
    }
  }

  render(true);
  dialog.focus();
}
