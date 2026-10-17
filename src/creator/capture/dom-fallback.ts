// Fallback for posts whose data never reached the capture layer (a response shape
// the parser doesn't know yet). Reads what the page shows, using Bot Meter
// core's own page helpers (see BotMeterCore in src/content.js) so the rules for
// finding a post's author and ID live in one place. X's 2026 client has no
// data-testid attributes; post text lives in [dir="auto"] blocks.
// The result is partial (no counts or media) and marked source: 'dom'.

import type { CoreHelpers } from '../core';
import type { Tweet } from '../types';
import { snowflakeTime } from '../util';

export function readArticle(article: Element, core: CoreHelpers): Tweet | null {
  const own = (el: Element): boolean => el.closest('article') === article;
  let handle: string | null = null;
  let handleLink: Element | null = null;
  for (const link of article.querySelectorAll('a[href^="/"]')) {
    if (!own(link)) continue;
    handle = core.authorHandle(link);
    if (handle) {
      handleLink = link;
      break;
    }
  }
  if (!handle) return null;
  const id = core.postId(article, handle);
  if (!id) return null;

  // Display name: the other link to the author's profile.
  let authorName = '';
  for (const a of article.querySelectorAll(`a[href="/${handle}" i]`)) {
    if (own(a) && a !== handleLink) {
      authorName = (a.textContent ?? '').trim();
      break;
    }
  }
  const text = [...article.querySelectorAll('[dir="auto"]')]
    .filter(own)
    .map((el) => (el.textContent ?? '').trim())
    .filter(Boolean)
    .join('\n');

  return {
    id,
    authorId: '0', // not shown on the page; GraphQL data fills it in when it arrives
    authorHandle: handle,
    authorName,
    authorAvatar: null,
    verified: false,
    text,
    createdAt: snowflakeTime(id),
    media: [],
    conversationId: null,
    metrics: { likes: 0, reposts: 0, replies: 0, quotes: 0, views: null, bookmarks: null },
    urls: [],
    source: 'dom',
  };
}
