// Typed access to Bot Meter's core (src/content.js), which publishes a small API
// on globalThis.BotMeterCore in the extension's content-script world. Creator
// Tools reuse its page observer, page helpers and scorer instead of keeping
// their own copies.

export type Level = 'ok' | 'warn' | 'bot';

export interface CoreStats {
  rate: number;
  ageDays: number;
  level: Level;
}

export interface CoreHelpers {
  /** Author handle from an "@handle" link that isn't a mention inside post text. */
  authorHandle(link: Element): string | null;
  /** A post's own ID from its permalink (/<author>/status/<id>). */
  postId(article: Element, author: string): string | null;
}

export interface BotMeterCore extends CoreHelpers {
  /**
   * Where Bot Meter puts the badge for an author link: the link itself or the
   * name/handle row around it. Its own badge goes right after this element, so
   * anything else should go after that badge.
   */
  badgeAnchor(link: Element): Element;
  /** Bot Meter's posts-per-day score for an account, if its data has been seen. */
  lookup(handle: string): { stats: CoreStats } | null;
  /** Runs after each of the core's (debounced) page scans; returns an unsubscribe function. */
  onScan(fn: () => void): () => void;
}

export function getCore(): BotMeterCore | null {
  const core = (globalThis as { BotMeterCore?: unknown }).BotMeterCore;
  if (typeof core !== 'object' || core === null) return null;
  const c = core as Partial<BotMeterCore>;
  return typeof c.authorHandle === 'function' &&
    typeof c.postId === 'function' &&
    typeof c.badgeAnchor === 'function' &&
    typeof c.lookup === 'function' &&
    typeof c.onScan === 'function'
    ? (core as BotMeterCore)
    : null;
}
