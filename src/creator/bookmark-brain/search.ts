// Full-text search over saved bookmarks (MiniSearch, in memory, on this device):
// post text, author name and handle, links, tags and notes.

import MiniSearch from 'minisearch';
import type { Bookmark } from './model';

interface Doc {
  id: string;
  text: string;
  author: string;
  urls: string;
  tags: string;
  note: string;
}

const toDoc = (b: Bookmark): Doc => ({
  id: b.id,
  text: b.tweet.text,
  author: `${b.tweet.authorName} ${b.tweet.authorHandle} @${b.tweet.authorHandle}`,
  urls: b.tweet.urls.join(' '),
  tags: b.tags.join(' '),
  note: b.note,
});

export class BookmarkSearch {
  private index = BookmarkSearch.create();

  private static create(): MiniSearch<Doc> {
    return new MiniSearch<Doc>({
      fields: ['text', 'author', 'urls', 'tags', 'note'],
      searchOptions: { boost: { author: 2, tags: 2 }, prefix: true, fuzzy: 0.2, combineWith: 'AND' },
    });
  }

  /** Rebuilds the index from scratch (fast enough for tens of thousands of posts). */
  rebuild(list: readonly Bookmark[]): void {
    this.index = BookmarkSearch.create();
    this.index.addAll(list.map(toDoc));
  }

  /** Matching IDs mapped to their rank (0 = best), or null for an empty query. */
  search(query: string): Map<string, number> | null {
    const q = query.trim();
    if (!q) return null;
    return new Map(this.index.search(q).map((r, i) => [String(r.id), i]));
  }
}
