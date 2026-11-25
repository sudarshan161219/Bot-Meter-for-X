const DEFAULTS = globalThis.BOT_METER_DEFAULTS;
const form = document.getElementById('form');

// Sliders with named steps (data-values="lenient,balanced,strict") store the name, not the position.
const stepNames = (field) => field.dataset?.values?.split(',') ?? null;

// The number next to a threshold slider.
function showValue(field) {
  const output = form.querySelector(`output[for="${field.id}"]`);
  if (output) output.textContent = Number(field.value).toLocaleString('en-US');
}

// Header line and faded settings while Bot Meter is off.
function showEnabled(on) {
  form.classList.toggle('off', !on);
  document.getElementById('state').textContent = on ? 'On for x.com' : 'Off: X looks as usual';
}

chrome.storage.sync.get(DEFAULTS, (settings) => {
  for (const [key, value] of Object.entries(settings)) {
    // A radio group comes back as a RadioNodeList; setting its value checks the matching button.
    const field = form.elements[key];
    if (!field) continue;
    const names = stepNames(field);
    if (field.type === 'checkbox') field.checked = value;
    else if (names) {
      field.value = String(Math.max(names.indexOf(value), 0));
      field.setAttribute('aria-valuetext', names[field.value]);
    } else field.value = value;
    if (field.type === 'range' && !names) showValue(field);
  }
  showEnabled(settings.enabled);
  showLook();
});

function save(field) {
  if (!(field.name in DEFAULTS)) return;
  const names = stepNames(field);
  let value;
  if (field.type === 'checkbox') value = field.checked;
  else if (names) {
    value = names[Number(field.value)] ?? DEFAULTS[field.name];
    field.setAttribute('aria-valuetext', value);
  } else if (field.type === 'number' || field.type === 'range') {
    value = Number(field.value);
    if (!Number.isFinite(value) || value <= 0) {
      field.value = DEFAULTS[field.name];
      value = DEFAULTS[field.name];
    }
  } else value = field.value;
  if (field.name === 'enabled') showEnabled(value);
  chrome.storage.sync.set({ [field.name]: value });
  showLook();
}

// --- Look tab ---

const PHOTO_KEY = 'backdropImage';

// Show only the controls the current choice needs, and preview the custom colour and photo.
function showLook() {
  const theme = form.elements.theme.value;
  const backdrop = form.elements.backdrop.value;
  document.getElementById('custom-row').hidden = theme !== 'custom';
  document.getElementById('custom-swatch').style.background = theme === 'custom' ? form.elements.themeColor.value : '';
  document.getElementById('backdrop-row').hidden = backdrop === 'none' || !backdrop;
  document.getElementById('photo-row').hidden = backdrop !== 'image';
}

// Only an image data: URL is ever shown (same check as the page's theme code).
const IMAGE_DATA_URL = /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/]+=*$/;

function showPhoto(value) {
  const dataUrl = typeof value === 'string' && IMAGE_DATA_URL.test(value) ? value : null;
  const swatch = document.getElementById('photo-swatch');
  swatch.style.background = dataUrl ? `center / cover no-repeat url("${dataUrl}")` : '';
  document.getElementById('photo-state').textContent = dataUrl ? 'Your photo' : 'No photo yet';
  document.getElementById('choose-photo').textContent = dataUrl ? 'Change…' : 'Choose photo…';
}

chrome.storage.local.get(PHOTO_KEY, (stored) => showPhoto(stored[PHOTO_KEY]));
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && PHOTO_KEY in changes) showPhoto(changes[PHOTO_KEY].newValue);
});

// The picture is picked on its own page: a file dialog can close the popup.
document.getElementById('choose-photo').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('src/backdrop.html') });
  window.close();
});

form.elements.themeColor.addEventListener('input', showLook);

form.addEventListener('change', (event) => save(event.target));

const typing = new Map();
form.addEventListener('input', (event) => {
  const field = event.target;
  // Threshold sliders show their number while dragging; the value saves on release.
  if (field.type === 'range' && !stepNames(field)) showValue(field);
  // Text lists save while typing (the popup can close before a change event fires).
  if (field.tagName !== 'TEXTAREA') return;
  clearTimeout(typing.get(field));
  typing.set(field, setTimeout(() => save(field), 400));
});

// Tabs, remembering the last one opened.
const tabs = [...document.querySelectorAll('[role="tab"]')];
function selectTab(tab) {
  for (const t of tabs) {
    const on = t === tab;
    t.setAttribute('aria-selected', String(on));
    t.tabIndex = on ? 0 : -1;
    document.getElementById(t.getAttribute('aria-controls')).hidden = !on;
  }
  try {
    localStorage.setItem('tab', tab.id);
  } catch {}
}
tabs.forEach((tab, i) => {
  tab.addEventListener('click', () => selectTab(tab));
  // Arrow keys move between tabs, as in any tab list.
  tab.addEventListener('keydown', (e) => {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    const next = tabs[(i + step + tabs.length) % tabs.length];
    selectTab(next);
    next.focus();
  });
});
try {
  const last = document.getElementById(localStorage.getItem('tab'));
  selectTab(tabs.includes(last) ? last : tabs[0]);
} catch {
  selectTab(tabs[0]);
}
