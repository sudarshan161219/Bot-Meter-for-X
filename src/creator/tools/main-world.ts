// Creator Tools for X, page world (document_start): reads the posts X's page
// already receives and hands normalized copies to the content script.
import { installHook } from '../capture/hook';
import { parseGraphQL } from '../capture/parse-graphql';
import { PAGE_SOURCE } from './protocol';

let errors = 0;
function send(data: unknown): void {
  if (errors >= 5) return;
  try {
    const { tweets, authors } = parseGraphQL(data);
    if (tweets.length || authors.length) {
      window.postMessage({ source: PAGE_SOURCE, type: 'capture', tweets, authors }, window.location.origin);
    }
  } catch (error) {
    if (++errors === 5) console.warn('[BotMeter:Creator] capture disabled after repeated errors', error);
  }
}

installHook(window as unknown as Parameters<typeof installHook>[0], send);

// Data embedded in the initial HTML by the older X client.
document.addEventListener('DOMContentLoaded', () => {
  const state = (window as { __INITIAL_STATE__?: unknown }).__INITIAL_STATE__;
  if (state) send(state);
});
