// Background photo page (backdrop.html): pick a picture, preview it under a mock
// feed, save it. The picture is shrunk to at most 1920 px and stored as a JPEG in
// chrome.storage.local (too big for sync); the choice itself (backdrop: 'image')
// and the readability dim are ordinary synced settings.
const DEFAULTS = globalThis.BOT_METER_DEFAULTS;
const PHOTO_KEY = 'backdropImage';
const MAX_SIDE = 1920;
const MAX_BYTES = 3.5 * 1024 * 1024;

const $ = (id) => document.getElementById(id);
const fileInput = $('file');
const drop = $('drop');
const editor = $('editor');
const preview = $('preview');
const dim = $('dim');
const status = $('status');
let pending = null; // a new picture not saved yet (data: URL)
let saved = null;
let themeBg = '#0b1020';

const PRESET_BG = { midnight: '#0b1020', ocean: '#0b1d26', forest: '#0f1a14', rose: '#1f1418', sepia: '#f4ecd8', slate: '#eef1f5' };

function hexToRgb(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return '11, 16, 32';
  const n = parseInt(m[1], 16);
  return `${n >> 16}, ${(n >> 8) & 255}, ${n & 255}`;
}

function render() {
  const picture = pending ?? saved;
  editor.hidden = !picture;
  $('remove').hidden = !saved;
  $('dim-value').textContent = `${dim.value}%`;
  if (!picture) return;
  const wash = `rgba(${hexToRgb(themeBg)}, ${Number(dim.value) / 100})`;
  preview.style.background = `linear-gradient(${wash}, ${wash}), center / cover no-repeat url("${picture}")`;
  $('save').textContent = pending ? 'Use this photo' : 'Saved';
  $('save').disabled = !pending;
}

// Shrinks the picture so it fits comfortably in extension storage.
async function shrink(file) {
  const bitmap = await createImageBitmap(file);
  for (const [side, quality] of [[MAX_SIDE, 0.82], [1600, 0.75], [1280, 0.7]]) {
    const scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    if (dataUrl.length * 0.75 <= MAX_BYTES) return dataUrl;
  }
  throw new Error('That picture is too large even after shrinking.');
}

const readAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Couldn't read that picture."));
    reader.readAsDataURL(file);
  });

// GIFs and WebP can be animated, and redrawing on a canvas keeps only the first
// frame, so they're kept as they are when they fit.
const MAY_ANIMATE = new Set(['image/gif', 'image/webp']);

async function pick(file) {
  if (!file || !file.type.startsWith('image/')) {
    status.textContent = 'Pick a JPG, PNG, WebP or GIF picture.';
    return;
  }
  status.textContent = 'Preparing…';
  try {
    if (MAY_ANIMATE.has(file.type) && file.size <= MAX_BYTES) {
      pending = await readAsDataUrl(file);
      status.textContent = '';
    } else {
      pending = await shrink(file);
      status.textContent =
        file.type === 'image/gif'
          ? `That GIF is over ${MAX_BYTES / 1024 / 1024} MB, so it's saved as a still picture. Use a smaller GIF to keep it moving.`
          : '';
    }
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : "Couldn't read that picture.";
  }
  render();
}

fileInput.addEventListener('change', () => pick(fileInput.files?.[0]));
drop.addEventListener('dragover', (e) => {
  e.preventDefault();
  drop.classList.add('over');
});
drop.addEventListener('dragleave', () => drop.classList.remove('over'));
drop.addEventListener('drop', (e) => {
  e.preventDefault();
  drop.classList.remove('over');
  pick(e.dataTransfer?.files?.[0]);
});

dim.addEventListener('input', render);
dim.addEventListener('change', () => chrome.storage.sync.set({ backdropDim: Number(dim.value) }));

$('save').addEventListener('click', async () => {
  if (!pending) return;
  try {
    await chrome.storage.local.set({ [PHOTO_KEY]: pending });
    await chrome.storage.sync.set({ backdrop: 'image', backdropDim: Number(dim.value) });
    saved = pending;
    pending = null;
    status.textContent = 'Saved. Open or refresh x.com to see it.';
  } catch {
    status.textContent = "Couldn't save the picture. Try a smaller one.";
  }
  render();
});

$('remove').addEventListener('click', async () => {
  await chrome.storage.local.remove(PHOTO_KEY);
  const { backdrop } = await chrome.storage.sync.get({ backdrop: DEFAULTS.backdrop });
  if (backdrop === 'image') await chrome.storage.sync.set({ backdrop: 'none' });
  saved = pending = null;
  status.textContent = 'Photo removed.';
  render();
});

chrome.storage.sync.get(DEFAULTS, (s) => {
  dim.value = String(s.backdropDim);
  themeBg = s.theme === 'custom' ? s.themeColor : PRESET_BG[s.theme] ?? '#0b1020';
  chrome.storage.local.get(PHOTO_KEY, (stored) => {
    const value = stored[PHOTO_KEY];
    saved = typeof value === 'string' && /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/]+=*$/.test(value) ? value : null;
    render();
  });
});
