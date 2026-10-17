// Which posts in an X response are bookmarks. Pure; runs in the page world.
//
// X's bookmark lists come from GraphQL operations named Bookmarks,
// BookmarkSearchTimeline, BookmarkFolderTimeline… Their posts sit in timeline
// entries ({ __typename: 'TimelineTweet', tweet_results }); posts quoted inside
// them don't, so they aren't counted as bookmarks.

import { unwrapTweet } from '../capture/parse-graphql';
import { get, isObj, str } from '../util';

const BOOKMARK_OPERATION = /\/graphql\/[^/?]+\/Bookmark[A-Za-z]*(?:[/?]|$)/;

/** A response from one of X's bookmark-list operations (or, for the first page load, the bookmarks page itself). */
export function isBookmarkResponse(url: string | null, pathname: string): boolean {
  return url === null ? /^\/i\/bookmarks(\/|$)/.test(pathname) : BOOKMARK_OPERATION.test(url);
}

/** IDs of the posts in a response's timeline entries, in timeline order (newest bookmark first). */
export function timelineTweetIds(root: unknown): string[] {
  const ids: string[] = [];
  const seen = new Set<object>();
  const stack: unknown[] = [root];
  try {
    while (stack.length) {
      const node = stack.pop();
      if (typeof node !== 'object' || node === null || seen.has(node)) continue;
      seen.add(node);
      if (isObj(node) && node.__typename === 'TimelineTweet') {
        const tweet = unwrapTweet(node.tweet_results);
        // A repost wrapper: the bookmark is the original post.
        const original = unwrapTweet(get(tweet, 'legacy', 'retweeted_status_results'));
        const id = str(original?.rest_id) ?? str(tweet?.rest_id);
        if (id && !ids.includes(id)) ids.push(id);
        continue; // don't descend: quoted posts inside aren't bookmarks
      }
      // Push children in reverse so they're visited in document order.
      const children = Array.isArray(node) ? node : Object.values(node);
      for (let i = children.length - 1; i >= 0; i--) {
        const child: unknown = children[i];
        if (typeof child === 'object' && child !== null) stack.push(child);
      }
    }
  } catch {
    // Unexpected shapes (getters that throw, proxies): keep what was found.
  }
  return ids;
}
