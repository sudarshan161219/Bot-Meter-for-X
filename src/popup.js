const DEFAULTS = globalThis.BOT_METER_DEFAULTS;
const form = document.getElementById('form');

chrome.storage.sync.get(DEFAULTS, (settings) => {
  for (const [key, value] of Object.entries(settings)) {
    const field = form.elements[key];
    if (!field) continue;
    if (field.type === 'checkbox') field.checked = value;
    else field.value = value;
  }
});

form.addEventListener('change', (event) => {
  const field = event.target;
  if (!(field.name in DEFAULTS)) return;
  let value;
  if (field.type === 'checkbox') value = field.checked;
  else if (field.type === 'number') {
    value = Number(field.value);
    if (!Number.isFinite(value) || value <= 0) {
      field.value = DEFAULTS[field.name];
      value = DEFAULTS[field.name];
    }
  } else value = field.value;
  chrome.storage.sync.set({ [field.name]: value });
});
