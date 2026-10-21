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
}

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
