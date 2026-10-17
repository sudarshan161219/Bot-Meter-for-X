// Creator Tools service worker:
//  - opens the print view for a thread's PDF export, handing it the posts
//    through session storage (in memory, cleared when the browser closes);
//  - saves bookmarks captured on x.com into Bookmark Brain's database (this
//    extension's own IndexedDB) and opens the Bookmark Brain page.
// It never makes network requests.
import { BookmarkDB, saveCaptured } from '../bookmark-brain/db';
import type { CapturedBookmark } from '../bookmark-brain/model';
import { coerceTweet } from '../capture/validate';
import { arr, get, isObj, num } from '../util';
import { BOOKMARKS_CHANGED, printKey } from './protocol';

const db = new BookmarkDB();

const openPage = (path: string, tab?: chrome.tabs.Tab): Promise<chrome.tabs.Tab> =>
  chrome.tabs.create({
    url: chrome.runtime.getURL(path),
    ...(tab && { index: tab.index + 1 }),
    ...(tab?.id !== undefined && { openerTabId: tab.id }),
  });

type Handler = (message: Record<string, unknown>, sender: chrome.runtime.MessageSender) => Promise<unknown>;

const handlers: Record<string, Handler> = {
  async 'open-print'(message, sender) {
    const id = crypto.randomUUID();
    await chrome.storage.session.set({ [printKey(id)]: { tweets: message.tweets, quoted: message.quoted } });
    await openPage(`print.html?id=${id}`, sender.tab);
    return { ok: true };
  },

  async 'bookmarks:save'(message) {
    const items: CapturedBookmark[] = [];
    for (const item of arr(message.items).slice(0, 500)) {
      const tweet = coerceTweet(get(item, 'tweet'));
      const order = num(get(item, 'order'));
      if (tweet && order !== null) items.push({ tweet, order });
    }
    const result = items.length ? await saveCaptured(db, items) : { added: 0, total: await db.bookmarks.count() };
    if (items.length) chrome.runtime.sendMessage({ type: BOOKMARKS_CHANGED }).catch(() => {}); // no page open: fine
    return { ok: true, ...result };
  },

  async 'bookmarks:count'() {
    return { ok: true, total: await db.bookmarks.count() };
  },

  async 'open-bookmarks'(_message, sender) {
    await openPage('bookmarks.html', sender.tab);
    return { ok: true };
  },
};

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  // Only this extension's own content scripts and pages talk to it.
  if (sender.id !== chrome.runtime.id || !isObj(message) || typeof message.type !== 'string') return false;
  const handler = handlers[message.type];
  if (!handler) return false;
  handler(message, sender).then(sendResponse, (error: unknown) => {
    console.warn('[BotMeter:Creator]', message.type, error);
    sendResponse({ ok: false });
  });
  return true; // responds asynchronously
});

// The toolbar button opens Bookmark Brain.
chrome.action.onClicked.addListener((tab) => {
  void openPage('bookmarks.html', tab);
});
