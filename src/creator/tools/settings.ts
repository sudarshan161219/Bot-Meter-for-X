// Creator Tools for X settings, with typed defaults, in chrome.storage.sync
// (they follow the reader's Chrome profile). Used by the popup and the
// content script.

import { isObj } from '../util';

export interface ToolsSettings {
  /** Export button on threads. */
  threadExporter: boolean;
  /** Save bookmarks while on x.com/i/bookmarks. */
  bookmarkBrain: boolean;
}

// On by default: unlike Bot Meter's Reply Filter, these live in their own
// extension, so installing it is the opt-in.
export const TOOLS_DEFAULTS: Readonly<ToolsSettings> = { threadExporter: true, bookmarkBrain: true };

export function coerceToolsSettings(raw: unknown): ToolsSettings {
  const r = isObj(raw) ? raw : {};
  const bool = (key: keyof ToolsSettings): boolean => (typeof r[key] === 'boolean' ? (r[key] as boolean) : TOOLS_DEFAULTS[key]);
  return { threadExporter: bool('threadExporter'), bookmarkBrain: bool('bookmarkBrain') };
}

/** Calls `fn` with the stored settings, then again whenever they change. */
export function watchToolsSettings(fn: (settings: ToolsSettings) => void): void {
  let current: Record<string, unknown> = { ...TOOLS_DEFAULTS };
  chrome.storage.sync.get({ ...TOOLS_DEFAULTS }, (stored) => {
    current = { ...current, ...stored };
    fn(coerceToolsSettings(current));
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    let relevant = false;
    for (const [key, change] of Object.entries(changes)) {
      if (!(key in TOOLS_DEFAULTS)) continue;
      current[key] = change.newValue;
      relevant = true;
    }
    if (relevant) fn(coerceToolsSettings(current));
  });
}

export const saveToolsSetting = (key: keyof ToolsSettings, value: boolean): Promise<void> => chrome.storage.sync.set({ [key]: value });
