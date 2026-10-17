// Creator Tools for X, page world (document_start): reads the posts X's page
// already receives and hands normalized copies to the content script.
import { isBookmarkResponse, timelineTweetIds } from '../bookmark-brain/detect';
import { installHook } from '../capture/hook';
import { parseGraphQL } from '../capture/parse-graphql';
import { PAGE_SOURCE } from './protocol';

let errors = 0;
function send(data: unknown, url: string | null): void {
  if (errors >= 5) return;
  try {
    const { tweets, authors } = parseGraphQL(data);
    if (!tweets.length && !authors.length) return;
    const bookmarks = isBookmarkResponse(url, location.pathname) ? timelineTweetIds(data) : [];
    window.postMessage({ source: PAGE_SOURCE, type: 'capture', tweets, authors, bookmarks }, window.location.origin);
  } catch (error) {
    if (++errors === 5) console.warn('[BotMeter:Creator] capture disabled after repeated errors', error);
  }
}

installHook(window as unknown as Parameters<typeof installHook>[0], send);

// Data embedded in the initial HTML by the older X client.
document.addEventListener('DOMContentLoaded', () => {
  const state = (window as { __INITIAL_STATE__?: unknown }).__INITIAL_STATE__;
  if (state) send(state, null);
});
