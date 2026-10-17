import { describe, expect, it } from 'vitest';
import { parseGraphQL } from '../../src/creator/capture/parse-graphql';
import { coerceCapture, coerceTweet } from '../../src/creator/capture/validate';
import { replayPage } from './replay';

describe('coerceCapture (messages from the page are untrusted)', () => {
  it('passes real parser output through unchanged', () => {
    const capture = parseGraphQL(replayPage('status-NASA.html'));
    const roundTripped = coerceCapture(structuredClone(capture));
    expect(roundTripped).toEqual(capture);
  });

  it('drops posts with bad IDs, handles or text, and non-https URLs', () => {
    const base = {
      id: '1',
      authorId: '2',
      authorHandle: 'ok_name',
      text: 'hi',
      metrics: {},
      media: [],
      urls: ['https://fine.example', 'javascript:alert(1)', 'http://plain.example'],
    };
    expect(coerceTweet(base)?.urls).toEqual(['https://fine.example']);
    expect(coerceTweet({ ...base, id: '1; drop' })).toBeNull();
    expect(coerceTweet({ ...base, authorHandle: 'way_too_long_for_a_handle' })).toBeNull();
    expect(coerceTweet({ ...base, text: 42 })).toBeNull();
    expect(coerceTweet({ ...base, authorAvatar: 'javascript:x' })?.authorAvatar).toBeNull();
    expect(coerceCapture({ tweets: 'nope', authors: null })).toEqual({ tweets: [], authors: [] });
  });
});
