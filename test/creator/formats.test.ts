import { describe, expect, it } from 'vitest';
import { fileStem, threadTitle, toMarkdown, toPlainText } from '../../src/creator/thread-exporter/formats';
import { post } from './thread-fixtures';

const quoted = post('900', 'Original announcement', { authorId: '7', authorHandle: 'acme', authorName: 'Acme' });
const thread = [
  post('100', 'How we cut build times in half 🧵\n\nA short thread.', { conversationId: '100' }),
  post('101', '# not a heading\n1. not a list\nSee https://example.com/a_b_c <b>bold</b>', {
    inReplyToId: '100',
    media: [{ type: 'photo', url: 'https://pbs.twimg.com/media/x.jpg', videoUrl: null, alt: 'A [chart]', width: 1, height: 1 }],
  }),
  post('102', 'Inspired by this:', {
    inReplyToId: '101',
    quoted: '900',
    media: [{ type: 'video', url: 'https://pbs.twimg.com/v.jpg', videoUrl: 'https://video.twimg.com/v.mp4', alt: null, width: 1, height: 1 }],
  }),
];
const options = { quoted: (id: string) => (id === '900' ? quoted : undefined) };

describe('Markdown export', () => {
  it('matches the snapshot', () => {
    expect(toMarkdown(thread, options)).toMatchSnapshot();
  });

  it('keeps URLs intact and stops plain text from becoming headings, lists or HTML', () => {
    const md = toMarkdown(thread, options);
    expect(md).toContain('https://example.com/a_b_c');
    expect(md).toContain('\\# not a heading');
    expect(md).toContain('1\\. not a list');
    expect(md).toContain('&lt;b>bold&lt;/b>');
    expect(md).toContain('![A chart](https://pbs.twimg.com/media/x.jpg)');
    expect(md).toContain('> **Acme** (@acme):');
  });

  it('links quoted posts that were not captured', () => {
    expect(toMarkdown([thread[2]!])).toContain('> Quoted post: https://x.com/i/status/900');
  });
});

describe('plain text export', () => {
  it('numbers posts and ends with the author and source link', () => {
    expect(toPlainText(thread, options)).toMatchSnapshot();
  });
});

describe('titles and file names', () => {
  it('uses the first line, shortened', () => {
    expect(threadTitle(thread)).toBe('How we cut build times in half 🧵');
    expect(threadTitle([post('1', 'x'.repeat(200))])).toHaveLength(80);
    expect(threadTitle([post('1', '')])).toBe('Thread');
    expect(fileStem(thread)).toBe('maya_writes-100');
  });
});
