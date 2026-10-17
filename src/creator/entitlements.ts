// What needs Creator Tools Pro. Bot Meter itself stays free; Creator Tools are
// planned as a one-time unlock. No payments yet: isPro() is always true.
// Every paid check goes through allowed(), so the gates live in this one file.
//
// When payments arrive, isPro() reads the stored unlock; nothing else changes.
// Bot Meter's popup is plain JS and can't import this: its "Hide completely"
// option stays selectable, and the Reply Filter falls back to Collapse when
// allowed('replyFilterHide') is false.

export type Gate =
  /** Carousel export themes beyond the default (Thread Exporter). */
  | 'carouselThemes'
  /** Tags, notes and export (Bookmark Brain). */
  | 'bookmarkExtras'
  /** "Hide completely" mode (Reply Filter); the free fallback is Collapse. */
  | 'replyFilterHide';

/** Pro features, for upgrade screens. */
export const PRO_FEATURES: Readonly<Record<Gate, string>> = {
  carouselThemes: 'Dark and brand-color carousel themes',
  bookmarkExtras: 'Bookmark Brain tags, notes and export',
  replyFilterHide: 'Reply Filter "Hide completely" mode',
};

export function isPro(): boolean {
  return true;
}

export function allowed(gate: Gate, pro: boolean = isPro()): boolean {
  return gate in PRO_FEATURES ? pro : true;
}
