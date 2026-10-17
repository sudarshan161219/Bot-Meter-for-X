// Creator Tools service worker. Its only job so far: open the print view for a
// thread's PDF export in a new tab next to the X tab, handing it the posts
// through session storage (kept in memory, cleared when the browser closes).
import { isObj } from '../util';
import { printKey } from './protocol';

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  if (!isObj(message) || message.type !== 'open-print' || !sender.tab) return false;
  const id = crypto.randomUUID();
  chrome.storage.session
    .set({ [printKey(id)]: { tweets: message.tweets, quoted: message.quoted } })
    .then(() =>
      chrome.tabs.create({
        url: chrome.runtime.getURL(`print.html?id=${id}`),
        index: sender.tab ? sender.tab.index + 1 : undefined,
        openerTabId: sender.tab?.id,
      })
    )
    .then(
      () => sendResponse({ ok: true }),
      (error: unknown) => {
        console.warn('[BotMeter:Creator] could not open the print view', error);
        sendResponse({ ok: false });
      }
    );
  return true; // responds asynchronously
});
