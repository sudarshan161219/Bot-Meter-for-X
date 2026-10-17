// Message formats inside the Creator Tools extension.

/** window.postMessage from the page hook (main-world.ts) to the content script. */
export const PAGE_SOURCE = 'creator-tools-x';

/**
 * chrome.runtime message from the content script: open the print view (PDF
 * export) for a thread. The print page validates the posts again before use.
 */
export interface OpenPrintMessage {
  type: 'open-print';
  tweets: unknown[];
  /** Posts the thread quotes. */
  quoted: unknown[];
}

/** Key in chrome.storage.session where the print page finds its content. */
export const printKey = (id: string): string => `print:${id}`;

/** Content script -> service worker: bookmarks seen on x.com/i/bookmarks (validated again there). */
export interface SaveBookmarksMessage {
  type: 'bookmarks:save';
  items: { tweet: unknown; order: number }[];
}

/** Service worker -> extension pages: the saved bookmarks changed. */
export const BOOKMARKS_CHANGED = 'bookmarks:changed';
