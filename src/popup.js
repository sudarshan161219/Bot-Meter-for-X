const DEFAULTS = globalThis.BOT_METER_DEFAULTS;
const form = document.getElementById('form');

// Sliders with named steps (data-values="lenient,balanced,strict") store the name, not the position.
const stepNames = (field) => field.dataset.values?.split(',') ?? null;

chrome.storage.sync.get(DEFAULTS, (settings) => {
  for (const [key, value] of Object.entries(settings)) {
    const field = form.elements[key];
    if (!field) continue;
    const names = stepNames(field);
    if (field.type === 'checkbox') field.checked = value;
    else if (names) {
      field.value = String(Math.max(names.indexOf(value), 0));
      field.setAttribute('aria-valuetext', names[field.value]);
    } else field.value = value;
  }
});

function save(field) {
  if (!(field.name in DEFAULTS)) return;
  const names = stepNames(field);
  let value;
  if (field.type === 'checkbox') value = field.checked;
  else if (names) {
    value = names[Number(field.value)] ?? DEFAULTS[field.name];
    field.setAttribute('aria-valuetext', value);
  } else if (field.type === 'number') {
    value = Number(field.value);
    if (!Number.isFinite(value) || value <= 0) {
      field.value = DEFAULTS[field.name];
      value = DEFAULTS[field.name];
    }
  } else value = field.value;
  chrome.storage.sync.set({ [field.name]: value });
}

form.addEventListener('change', (event) => save(event.target));

// Text lists save while typing (the popup can close before a change event fires).
const typing = new Map();
form.addEventListener('input', (event) => {
  const field = event.target;
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
    document.getElementById(t.getAttribute('aria-controls')).hidden = !on;
  }
  try {
    localStorage.setItem('tab', tab.id);
  } catch {}
}
for (const tab of tabs) tab.addEventListener('click', () => selectTab(tab));
try {
  const last = document.getElementById(localStorage.getItem('tab'));
  if (tabs.includes(last)) selectTab(last);
} catch {}
