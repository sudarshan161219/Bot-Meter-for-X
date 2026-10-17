// Print view (print.html): shows a thread in a clean reading layout and opens
// the browser's print dialog, where "Save as PDF" produces the PDF.
import { coerceTweet } from '../capture/validate';
import { renderReading } from '../thread-exporter/reading';
import { threadTitle } from '../thread-exporter/formats';
import type { Tweet } from '../types';
import { arr, isObj } from '../util';
import { printKey } from './protocol';

async function main(): Promise<void> {
  const id = new URLSearchParams(location.search).get('id') ?? '';
  const key = printKey(id);
  const stored = (await chrome.storage.session.get(key))[key];
  await chrome.storage.session.remove(key);
  const status = document.getElementById('status');
  if (!isObj(stored)) {
    if (status) status.textContent = 'This print view has expired. Export the thread again from X.';
    return;
  }
  const valid = (list: unknown): Tweet[] => arr(list).map(coerceTweet).filter((t): t is Tweet => t !== null);
  const tweets = valid(stored.tweets);
  const quoted = new Map(valid(stored.quoted).map((t) => [t.id, t]));
  document.title = threadTitle(tweets);
  status?.remove();
  document.getElementById('content')?.append(renderReading(document, tweets, (q) => quoted.get(q)));

  document.getElementById('print')?.addEventListener('click', () => window.print());
  // Wait (up to 5 s) for images so they make it into the PDF, then open the dialog.
  const loaded = (img: HTMLImageElement): Promise<unknown> =>
    img.complete
      ? Promise.resolve()
      : new Promise((done) => {
          img.addEventListener('load', done, { once: true });
          img.addEventListener('error', done, { once: true });
        });
  await Promise.race([Promise.all([...document.images].map(loaded)), new Promise((done) => setTimeout(done, 5000))]);
  setTimeout(() => window.print(), 300);
}

main().catch((error: unknown) => console.warn('[BotMeter:Creator]', error));
