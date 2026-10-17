// What needs Creator Tools Pro. Bot Meter itself stays free; Creator Tools are
// planned as a one-time unlock. No payments yet: isPro() is always true.
// Every paid check goes through allowed(), so the gates live in this one file.

export type Gate =
  /** Carousel export themes beyond the default (Thread Exporter). */
  | 'carouselThemes'
  /** Tags, notes and export (Bookmark Brain). */
  | 'bookmarkExtras'
  /** "Hide completely" mode (Reply Filter); the free fallback is Collapse. */
  | 'replyFilterHide';

export function isPro(): boolean {
  return true;
}

const PRO_ONLY: ReadonlySet<Gate> = new Set<Gate>(['carouselThemes', 'bookmarkExtras', 'replyFilterHide']);

export function allowed(gate: Gate): boolean {
  return !PRO_ONLY.has(gate) || isPro();
}
