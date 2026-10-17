// Creator Tools for X toolbar popup: feature switches, a shortcut to Bookmark
// Brain, and (once payments exist) what Pro adds.
import { isPro, PRO_FEATURES } from '../entitlements';
import { num } from '../util';
import { type ToolsSettings, saveToolsSetting, watchToolsSettings } from './settings';

const form = document.getElementById('form') as HTMLFormElement;
const keys: (keyof ToolsSettings)[] = ['threadExporter', 'bookmarkBrain'];

watchToolsSettings((settings) => {
  for (const key of keys) {
    const field = form.elements.namedItem(key);
    if (field instanceof HTMLInputElement) field.checked = settings[key];
  }
});

form.addEventListener('change', (e) => {
  const field = e.target;
  if (field instanceof HTMLInputElement && (keys as string[]).includes(field.name)) {
    void saveToolsSetting(field.name as keyof ToolsSettings, field.checked);
  }
});

document.getElementById('open-bookmarks')?.addEventListener('click', () => {
  void chrome.tabs.create({ url: chrome.runtime.getURL('bookmarks.html') }).then(() => window.close());
});

chrome.runtime
  .sendMessage({ type: 'bookmarks:count' })
  .then((reply: unknown) => {
    const total = num((reply as { total?: unknown } | null)?.total);
    const count = document.getElementById('count');
    if (count && total !== null) count.textContent = `${total.toLocaleString('en-US')} bookmark${total === 1 ? '' : 's'} saved on this device`;
  })
  .catch(() => {});

if (!isPro()) {
  const list = document.getElementById('pro-list');
  for (const label of Object.values(PRO_FEATURES)) {
    const li = document.createElement('li');
    li.textContent = label;
    list?.append(li);
  }
  const pro = document.getElementById('pro');
  if (pro) pro.hidden = false;
}
