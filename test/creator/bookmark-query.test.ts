import { describe, expect, it } from 'vitest';
import { toCSV, parseImport, toJSON, toMarkdownByTag } from '../../src/creator/bookmark-brain/export';
import type { Bookmark } from '../../src/creator/bookmark-brain/model';
import { applyFilters, authorCounts, NO_FILTERS, sortBookmarks, tagCounts } from '../../src/creator/bookmark-brain/query';
import { BookmarkSearch } from '../../src/creator/bookmark-brain/search';
import { DEFAULT_RULES, formatRules, parseRules, suggestTags } from '../../src/creator/bookmark-brain/tags';
import { post } from './thread-fixtures';

const metrics = (likes: number, reposts = 0) => ({ likes, reposts, replies: 0, quotes: 0, views: null, bookmarks: null });
const day = (d: string): number => new Date(`${d}T12:00:00`).getTime();
const bm = (id: string, extra: Partial<Bookmark>, tweet: Parameters<typeof post>[2] = {}, text = `post ${id}`): Bookmark => ({
  id,
  tweet: post(id, text, tweet),
  capturedAt: 1000,
  order: Number(id),
  tags: [],
  note: '',
  updatedAt: 1000,
  ...extra,
});

const list = [
  bm('1', { tags: ['ai'] }, { createdAt: day('2026-01-05'), metrics: metrics(10) }, 'New LLM benchmark results https://t.co/x'),
  bm('2', { tags: ['ai', 'dev'], note: 'compare with ours' }, { createdAt: day('2026-03-01'), metrics: metrics(500, 100), urls: ['https://github.com/a/b'] }, 'A tiny Rust parser'),
  bm('3', {}, { createdAt: day('2026-06-20'), metrics: metrics(50), authorHandle: 'Other', authorName: 'Other', media: [{ type: 'photo', url: 'https://pbs.twimg.com/m.jpg', videoUrl: null, alt: null, width: 1, height: 1 }] }, 'Sunset photo'),
];

describe('filters and sorting', () => {
  const ids = (l: Bookmark[]) => l.map((b) => b.id);

  it('filters by author, dates, media, links, likes and tags', () => {
    expect(ids(applyFilters(list, { ...NO_FILTERS, author: 'other' }))).toEqual(['3']);
    expect(ids(applyFilters(list, { ...NO_FILTERS, from: '2026-02-01', to: '2026-03-01' }))).toEqual(['2']);
    expect(ids(applyFilters(list, { ...NO_FILTERS, hasMedia: true }))).toEqual(['3']);
    expect(ids(applyFilters(list, { ...NO_FILTERS, hasLinks: true }))).toEqual(['2']);
    expect(ids(applyFilters(list, { ...NO_FILTERS, minLikes: 50 }))).toEqual(['2', '3']);
    expect(ids(applyFilters(list, { ...NO_FILTERS, tags: ['ai', 'dev'] }))).toEqual(['2']);
    expect(ids(applyFilters(list, { ...NO_FILTERS, untagged: true }))).toEqual(['3']);
    expect(ids(applyFilters(list, NO_FILTERS, new Set(['1', '3'])))).toEqual(['1', '3']);
  });

  it('sorts by date bookmarked, posted, engagement or relevance', () => {
    expect(ids(sortBookmarks(list, 'bookmarked'))).toEqual(['3', '2', '1']);
    expect(ids(sortBookmarks(list, 'posted'))).toEqual(['3', '2', '1']);
    expect(ids(sortBookmarks(list, 'engagement'))).toEqual(['2', '3', '1']);
    expect(ids(sortBookmarks(list, 'relevance', new Map([['1', 0], ['3', 1]])))).toEqual(['1', '3', '2']);
  });

  it('counts authors and tags', () => {
    expect(authorCounts(list).map((c) => [c.key, c.count])).toEqual([['maya_writes', 2], ['other', 1]]);
    expect(tagCounts(list).map((c) => [c.key, c.count])).toEqual([['ai', 2], ['dev', 1]]);
  });
});

describe('search', () => {
  it('finds by text, author, link, tag and note, with prefixes', () => {
    const s = new BookmarkSearch();
    s.rebuild(list);
    const ids = (q: string) => [...(s.search(q)?.keys() ?? [])].sort();
    expect(ids('benchmark')).toEqual(['1']);
    expect(ids('rus')).toEqual(['2']);
    expect(ids('github')).toEqual(['2']);
    expect(ids('dev')).toEqual(['2']);
    expect(ids('compare ours')).toEqual(['2']);
    expect(ids('other')).toEqual(['3']);
    expect(s.search('  ')).toBeNull();
  });
});

describe('tag rules', () => {
  it('parse, format and suggest', () => {
    const rules = parseRules('AI: llm, GPT\n\nnot a rule\nDev Tools: rust, github ,');
    expect(rules).toEqual([
      { tag: 'ai', keywords: ['llm', 'gpt'] },
      { tag: 'dev-tools', keywords: ['rust', 'github'] },
    ]);
    expect(parseRules(formatRules(DEFAULT_RULES))).toEqual(DEFAULT_RULES);
    expect(suggestTags(list[0]!.tweet, rules)).toEqual(['ai']);
    expect(suggestTags(list[1]!.tweet, rules)).toEqual(['dev-tools']); // "github" from its link
    expect(suggestTags(list[1]!.tweet, rules, ['dev-tools'])).toEqual([]);
    expect(suggestTags(post('9', 'Trusting the process'), rules)).toEqual([]); // "rust" inside a word
  });
});

describe('export and import', () => {
  it('round-trips through JSON', () => {
    const { bookmarks, skipped } = parseImport(toJSON(list));
    expect(skipped).toBe(0);
    expect(bookmarks).toEqual(list);
  });

  it('refuses files that are not Bookmark Brain exports', () => {
    expect(() => parseImport('nope')).toThrow(/valid JSON/);
    expect(() => parseImport('{"bookmarks": []}')).toThrow(/Bookmark Brain export/);
    expect(() => parseImport('{"format":"bookmark-brain","version":99,"bookmarks":[]}')).toThrow(/newer version/);
    expect(parseImport('{"format":"bookmark-brain","version":1,"bookmarks":[{"x":1}]}').skipped).toBe(1);
  });

  it('writes CSV that spreadsheets open safely', () => {
    const csv = toCSV([bm('5', { note: '=HYPERLINK("http://evil")', tags: ['a', 'b'] }, {}, 'Line one\nsaid "hi"')]);
    expect(csv.startsWith('﻿url,author_handle')).toBe(true);
    expect(csv).toContain('"Line one\nsaid ""hi"""');
    expect(csv).toContain(`"'=HYPERLINK(""http://evil"")"`);
    expect(csv).toContain('"a b"');
  });

  it('groups Markdown by tag, untagged last', () => {
    const md = toMarkdownByTag(list, Date.parse('2026-10-01T00:00:00Z'));
    expect(md).toMatchSnapshot();
    expect(md.indexOf('## ai')).toBeLessThan(md.indexOf('## dev'));
    expect(md.indexOf('## dev')).toBeLessThan(md.indexOf('## Untagged'));
  });
});
