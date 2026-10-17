import { describe, expect, it } from 'vitest';
import { assembleThread, isThread } from '../../src/creator/thread-exporter/thread';
import { cacheOf, post } from './thread-fixtures';

const other = { authorId: '99', authorHandle: 'someone', authorName: 'Someone' };

describe('assembleThread', () => {
  const root = post('100', 'How we cut build times in half 🧵', { conversationId: '100' });
  const t2 = post('101', 'First, caching.', { inReplyToId: '100' });
  const t3 = post('102', 'Second, parallel tests.', { inReplyToId: '101' });
  const t4 = post('103', 'That is all.', { inReplyToId: '102' });
  const reply = post('200', 'Great thread', { ...other, inReplyToId: '100' });
  const lateSelfReply = post('104', 'Answering a question below', { inReplyToId: '200' });
  const branch = post('105', 'A later aside on the first post', { inReplyToId: '100' });

  it("follows the author's replies to themselves, in order, ignoring other people", () => {
    const cache = cacheOf(t4, reply, t2, root, t3, lateSelfReply, branch);
    const thread = assembleThread('100', cache.tweets);
    expect(thread?.tweets.map((t) => t.id)).toEqual(['100', '101', '102', '103']);
    expect(thread?.missingStart).toBe(false);
    expect(isThread(thread)).toBe(true);
  });

  it('finds the same thread from any post in it', () => {
    const cache = cacheOf(root, t2, t3, t4);
    expect(assembleThread('102', cache.tweets)?.tweets.map((t) => t.id)).toEqual(['100', '101', '102', '103']);
  });

  it("flags a thread whose first post isn't loaded yet", () => {
    const cache = cacheOf(t2, t3);
    const thread = assembleThread('102', cache.tweets);
    expect(thread?.tweets.map((t) => t.id)).toEqual(['101', '102']);
    expect(thread?.missingStart).toBe(true);
  });

  it('starts at a reply to someone else when that is where the author began', () => {
    const op = post('300', 'Question?', other);
    const a1 = post('301', 'Long answer, part 1', { inReplyToId: '300' });
    const a2 = post('302', 'part 2', { inReplyToId: '301' });
    const thread = assembleThread('302', cacheOf(op, a1, a2).tweets);
    expect(thread?.tweets.map((t) => t.id)).toEqual(['301', '302']);
    expect(thread?.missingStart).toBe(false);
  });

  it('a single post is not a thread; unknown posts give null', () => {
    expect(isThread(assembleThread('100', cacheOf(root).tweets))).toBe(false);
    expect(assembleThread('999', cacheOf(root).tweets)).toBeNull();
  });

  it('matches page-only posts by handle and survives reply loops', () => {
    const domRoot = post('400', 'From the page', { authorId: '0', source: 'dom' });
    const domNext = post('401', 'Also from the page', { authorId: '0', source: 'dom', inReplyToId: '400' });
    expect(assembleThread('400', cacheOf(domRoot, domNext).tweets)?.tweets).toHaveLength(2);
    const a = post('500', 'a', { inReplyToId: '501' });
    const b = post('501', 'b', { inReplyToId: '500' });
    expect(assembleThread('500', cacheOf(a, b).tweets)?.tweets.length).toBeLessThanOrEqual(2);
  });
});
