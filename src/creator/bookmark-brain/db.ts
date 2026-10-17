// Bookmark Brain's database: IndexedDB (via Dexie) in the extension's own
// origin, used by the service worker and the bookmarks page. Nothing here is
// ever sent anywhere.

import { Dexie, type EntityTable } from 'dexie';
import { type Bookmark, type CapturedBookmark, cleanTags, MAX_NOTE, mergeCaptured, mergeImported } from './model';

export interface Meta {
  key: string;
  value: unknown;
}

export class BookmarkDB extends Dexie {
  bookmarks!: EntityTable<Bookmark, 'id'>;
  meta!: EntityTable<Meta, 'key'>;

  constructor(name = 'bookmark-brain') {
    super(name);
    // Schema history. To change it, add version(n + 1) with the new stores and
    // an .upgrade() that migrates existing rows; never edit an existing version.
    this.version(1).stores({
      bookmarks: 'id, capturedAt, order, *tags',
      meta: 'key',
    });
  }
}

/** Saves captured bookmarks; returns how many were new and the new total. */
export async function saveCaptured(
  db: BookmarkDB,
  items: readonly CapturedBookmark[],
  now = Date.now()
): Promise<{ added: number; total: number }> {
  return db.transaction('rw', db.bookmarks, async () => {
    const existing = await db.bookmarks.bulkGet(items.map((i) => i.tweet.id));
    let added = 0;
    const rows = items.map((item, i) => {
      const known = existing[i];
      if (!known) added++;
      return mergeCaptured(known, item, now);
    });
    await db.bookmarks.bulkPut(rows);
    return { added, total: await db.bookmarks.count() };
  });
}

export async function importBookmarks(db: BookmarkDB, list: readonly Bookmark[]): Promise<{ added: number; updated: number }> {
  return db.transaction('rw', db.bookmarks, async () => {
    const existing = await db.bookmarks.bulkGet(list.map((b) => b.id));
    let added = 0;
    const rows = list.map((b, i) => {
      if (!existing[i]) added++;
      return mergeImported(existing[i], b);
    });
    await db.bookmarks.bulkPut(rows);
    return { added, updated: list.length - added };
  });
}

export async function updateBookmark(db: BookmarkDB, id: string, changes: { tags?: string[]; note?: string }): Promise<void> {
  const patch: Partial<Bookmark> = { updatedAt: Date.now() };
  if (changes.tags) patch.tags = cleanTags(changes.tags);
  if (changes.note !== undefined) patch.note = changes.note.slice(0, MAX_NOTE);
  await db.bookmarks.update(id, patch);
}

export async function deleteAll(db: BookmarkDB): Promise<void> {
  await db.transaction('rw', db.bookmarks, db.meta, async () => {
    await db.bookmarks.clear();
    await db.meta.clear();
  });
}
