import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { BookmarkDB, deleteAll, importBookmarks, saveCaptured, updateBookmark } from '../../src/creator/bookmark-brain/db';
import { coerceBookmark, normalizeTag } from '../../src/creator/bookmark-brain/model';
import { post } from './thread-fixtures';

let n = 0;
let db: BookmarkDB;
const open = (): BookmarkDB => (db = new BookmarkDB(`test-${++n}`));
afterEach(async () => {
  await db.delete();
});

describe('Bookmark Brain database', () => {
  it('saves captured bookmarks once, refreshing post data but keeping tags, note and order', async () => {
    open();
    const first = await saveCaptured(db, [{ tweet: post('1', 'one'), order: 100 }, { tweet: post('2', 'two'), order: 99 }], 1000);
    expect(first).toEqual({ added: 2, total: 2 });
    await updateBookmark(db, '1', { tags: ['AI', '#ai', 'Deep Learning'], note: 'read later' });

    const fresher = post('1', 'one', { metrics: { likes: 50, reposts: 0, replies: 0, quotes: 0, views: null, bookmarks: null } });
    const again = await saveCaptured(db, [{ tweet: fresher, order: 500 }], 2000);
    expect(again).toEqual({ added: 0, total: 2 });
    const saved = await db.bookmarks.get('1');
    expect(saved).toMatchObject({ capturedAt: 1000, order: 100, tags: ['ai', 'deep-learning'], note: 'read later', updatedAt: 2000 });
    expect(saved?.tweet.metrics.likes).toBe(50);
  });

  it("never replaces full post data with the page's partial copy", async () => {
    open();
    await saveCaptured(db, [{ tweet: post('1', 'full text'), order: 1 }]);
    await saveCaptured(db, [{ tweet: post('1', 'partial', { source: 'dom' }), order: 1 }]);
    expect((await db.bookmarks.get('1'))?.tweet.text).toBe('full text');
  });

  it('imports by merging: new ones added, tags combined, existing notes kept', async () => {
    open();
    await saveCaptured(db, [{ tweet: post('1', 'one'), order: 1 }], 5000);
    await updateBookmark(db, '1', { tags: ['mine'], note: 'my note' });
    const imported = [
      coerceBookmark({ tweet: post('1', 'one'), capturedAt: 10, tags: ['theirs'], note: 'their note' }),
      coerceBookmark({ tweet: post('3', 'three'), capturedAt: 10, tags: ['x'] }),
    ].filter((b) => b !== null);
    expect(await importBookmarks(db, imported)).toEqual({ added: 1, updated: 1 });
    expect(await db.bookmarks.get('1')).toMatchObject({ tags: ['mine', 'theirs'], note: 'my note', capturedAt: 10 });
    expect(await db.bookmarks.count()).toBe(2);
  });

  it('deletes everything, including tag rules', async () => {
    open();
    await saveCaptured(db, [{ tweet: post('1', 'one'), order: 1 }]);
    await db.meta.put({ key: 'tagRules', value: 'a: b' });
    await deleteAll(db);
    expect(await db.bookmarks.count()).toBe(0);
    expect(await db.meta.count()).toBe(0);
  });

  it('finds bookmarks by tag through the multi-entry index', async () => {
    open();
    await saveCaptured(db, [{ tweet: post('1', 'a'), order: 1 }, { tweet: post('2', 'b'), order: 2 }]);
    await updateBookmark(db, '2', { tags: ['ai', 'dev'] });
    expect((await db.bookmarks.where('tags').equals('dev').toArray()).map((b) => b.id)).toEqual(['2']);
  });
});

describe('model', () => {
  it('normalizes tags', () => {
    expect(normalizeTag('  #Machine Learning! ')).toBe('machine-learning');
    expect(normalizeTag('日本語')).toBe('日本語');
    expect(normalizeTag('###')).toBe('');
  });

  it('rejects imported entries without a valid post', () => {
    expect(coerceBookmark({ tweet: { id: 'nope' } })).toBeNull();
    expect(coerceBookmark('x')).toBeNull();
    expect(coerceBookmark({ tweet: post('1', 'ok'), tags: ['A', 5, 'a'], note: 'x'.repeat(9000) })).toMatchObject({ tags: ['a'] });
  });
});
