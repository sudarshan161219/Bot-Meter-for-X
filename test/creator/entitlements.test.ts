import { describe, expect, it } from 'vitest';
import { allowed, isPro, PRO_FEATURES, type Gate } from '../../src/creator/entitlements';
import { coerceToolsSettings, TOOLS_DEFAULTS } from '../../src/creator/tools/settings';
import { coerceSettings } from '../../src/creator/settings';

describe('entitlements', () => {
  it('unlocks everything while there are no payments', () => {
    expect(isPro()).toBe(true);
    for (const gate of Object.keys(PRO_FEATURES) as Gate[]) expect(allowed(gate)).toBe(true);
  });

  it('locks every Pro gate for free users', () => {
    for (const gate of Object.keys(PRO_FEATURES) as Gate[]) expect(allowed(gate, false)).toBe(false);
  });
});

describe('settings defaults', () => {
  it('Bot Meter: Reply Filter on in badge mode, anything malformed falls back', () => {
    expect(coerceSettings({})).toMatchObject({ replyFilter: true, replyFilterMode: 'badge', replyFilterSensitivity: 'balanced' });
    expect(coerceSettings({ replyFilterMode: 'explode', replyFilter: 'yes' })).toMatchObject({ replyFilter: true, replyFilterMode: 'badge' });
  });

  it('Creator Tools: features on, stored values respected', () => {
    expect(coerceToolsSettings(undefined)).toEqual(TOOLS_DEFAULTS);
    expect(coerceToolsSettings({ bookmarkBrain: false, threadExporter: 1 })).toEqual({ threadExporter: true, bookmarkBrain: false });
  });
});
