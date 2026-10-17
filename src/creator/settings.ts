// Typed view of the Creator Tools settings. They live with Bot Meter's own in
// chrome.storage.sync, with defaults in src/settings.js (BOT_METER_DEFAULTS,
// loaded before this bundle), so the popup handles them like any other setting.

import type { Sensitivity } from './reply-filter/rules';
import { isObj } from './util';

export type ReplyFilterMode = 'badge' | 'collapse' | 'hide';

export interface CreatorSettings {
  /** Bot Meter's master switch: off turns Creator Tools off too. */
  enabled: boolean;
  replyFilter: boolean;
  replyFilterMode: ReplyFilterMode;
  replyFilterSensitivity: Sensitivity;
  replyFilterAllow: string;
  replyFilterMuted: string;
}

const FALLBACK: CreatorSettings = {
  enabled: true,
  replyFilter: true,
  replyFilterMode: 'badge',
  replyFilterSensitivity: 'balanced',
  replyFilterAllow: '',
  replyFilterMuted: '',
};

const MODES: readonly ReplyFilterMode[] = ['badge', 'collapse', 'hide'];
const SENSITIVITIES: readonly Sensitivity[] = ['lenient', 'balanced', 'strict'];

const pick = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.find((a) => a === value) ?? fallback;

/** Stored values -> typed settings; anything missing or malformed falls back to the default. */
export function coerceSettings(raw: unknown): CreatorSettings {
  const r = isObj(raw) ? raw : {};
  const bool = (key: 'enabled' | 'replyFilter'): boolean =>
    typeof r[key] === 'boolean' ? (r[key] as boolean) : FALLBACK[key];
  const text = (key: 'replyFilterAllow' | 'replyFilterMuted'): string =>
    typeof r[key] === 'string' ? (r[key] as string).slice(0, 4000) : FALLBACK[key];
  return {
    enabled: bool('enabled'),
    replyFilter: bool('replyFilter'),
    replyFilterMode: pick(r.replyFilterMode, MODES, FALLBACK.replyFilterMode),
    replyFilterSensitivity: pick(r.replyFilterSensitivity, SENSITIVITIES, FALLBACK.replyFilterSensitivity),
    replyFilterAllow: text('replyFilterAllow'),
    replyFilterMuted: text('replyFilterMuted'),
  };
}

/** Calls `fn` with the current settings, then again whenever they change. */
export function watchSettings(fn: (settings: CreatorSettings) => void): void {
  const defaults = (globalThis as { BOT_METER_DEFAULTS?: unknown }).BOT_METER_DEFAULTS;
  let current: Record<string, unknown> = isObj(defaults) ? { ...defaults } : { ...FALLBACK };
  chrome.storage.sync.get(current, (stored) => {
    current = { ...current, ...stored };
    fn(coerceSettings(current));
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    let relevant = false;
    for (const [key, change] of Object.entries(changes)) {
      if (!(key in FALLBACK)) continue;
      current[key] = change.newValue;
      relevant = true;
    }
    if (relevant) fn(coerceSettings(current));
  });
}
