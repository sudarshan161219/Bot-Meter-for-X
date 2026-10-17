import { describe, expect, it } from 'vitest';
import {
  engagementBait,
  genericPhrase,
  isEmojiOnly,
  isExempt,
  isTooShort,
  judgeReply,
  mutedKeyword,
  normalizeReply,
  parseList,
  promotion,
  RepeatIndex,
  verdictLabel,
} from '../../src/creator/reply-filter/rules';

describe('normalizeReply', () => {
  it('drops @mentions, links, case and extra spaces', () => {
    expect(normalizeReply('@NASA @esa  Great   POST https://t.co/abc')).toBe('great post');
    expect(normalizeReply('Read this: x.com/i/status/1 ok')).toBe('read this: ok');
  });
});

describe('isEmojiOnly', () => {
  it.each(['🔥🔥', '👏🏽👏🏽👏🏽', '😂!!', '@nasa 🚀', '❤️', '🇺🇸'])('%s is emoji only', (t) => {
    expect(isEmojiOnly(t)).toBe(true);
  });
  it.each(['🔥 launch day', '100', 'ok', '', '!!!'])('%s is not', (t) => {
    expect(isEmojiOnly(t)).toBe(false);
  });
});

describe('genericPhrase', () => {
  it.each([
    ['Great post!', 'great post'],
    ['this', 'this'],
    ['@nasa Facts 💯', 'facts'],
    ['So true so true', 'so true'],
    ['THIS THIS THIS', 'this'],
    ['Thanks for sharing!!', 'thanks for sharing'],
  ])('%s -> %s', (text, phrase) => {
    expect(genericPhrase(text)).toBe(phrase);
  });

  it('leaves real replies alone', () => {
    expect(genericPhrase('This is why the heat shield test matters')).toBeNull();
    expect(genericPhrase('great post about the launch window math')).toBeNull();
    expect(genericPhrase('🔥🔥')).toBeNull(); // emoji-only has its own rule
  });
});

describe('isTooShort', () => {
  it('flags a word or two that says nothing', () => {
    expect(isTooShort('ok')).toBe(true);
    expect(isTooShort('@nasa hmm')).toBe(true);
  });
  it('skips questions, stock phrases (own rule) and real replies', () => {
    expect(isTooShort('why?')).toBe(false);
    expect(isTooShort('facts')).toBe(false);
    expect(isTooShort('Launch moved to Friday')).toBe(false);
  });
});

describe('promotion', () => {
  it('spots Telegram/WhatsApp links in text or expanded URLs', () => {
    expect(promotion('join us t.me/pumpgroup')).toBe('links to Telegram/WhatsApp');
    expect(promotion('see link', ['https://wa.me/123456'])).toBe('links to Telegram/WhatsApp');
  });
  it.each(['Huge AIRDROP live now', 'DM me for details', 'check my bio 👀', 'link in bio', 'I recover lost funds fast', 'earn $500 daily'])(
    '%s',
    (t) => {
      expect(promotion(t)).toMatch(/^promotion/);
    }
  );
  it('ignores the same words inside other words, and plain mentions of the apps', () => {
    expect(promotion('the admiral was dmmed')).toBeNull();
    expect(promotion('Telegram fixed the outage')).toBeNull();
    expect(promotion('https://example.com/telemetry')).toBeNull();
  });
});

describe('engagementBait', () => {
  it.each(['Follow back?', 'f4f anyone', "Let's connect!", 'lets connect 🤝', 'gain followers fast', '#followback'])('%s', (t) => {
    expect(engagementBait(t)).toMatch(/^engagement bait/);
  });
  it('ignores ordinary uses', () => {
    expect(engagementBait('Hard to follow the backstory here')).toBeNull();
    expect(engagementBait('We should connect the dots')).toBeNull();
  });
});

describe('mutedKeyword and parseList', () => {
  it('parses comma or line separated lists, dropping @ and duplicates', () => {
    expect(parseList('@Alice, bob\n\n alice ,')).toEqual(['alice', 'bob']);
  });
  it('matches words whole and symbols anywhere', () => {
    expect(mutedKeyword('Big Giveaway today', ['giveaway'])).toBe('giveaway');
    expect(mutedKeyword('giveaways are fun', ['giveaway'])).toBeNull();
    expect(mutedKeyword('to the moon 🚀🚀', ['🚀'])).toBe('🚀');
    expect(mutedKeyword('anything', [])).toBeNull();
  });
});

describe('RepeatIndex', () => {
  it('counts other accounts posting the same reply, ignoring mentions and case', () => {
    const index = new RepeatIndex();
    index.add('a', '@op Amazing insight, sharing with my team!');
    index.add('B', 'amazing insight, sharing with my team');
    index.add('b', 'Amazing insight, sharing with my team');
    expect(index.othersWith('a', 'Amazing insight, sharing with my team!')).toBe(1);
    expect(index.othersWith('c', 'amazing insight sharing with my team')).toBe(2);
    expect(index.othersWith('a', 'something else')).toBe(0);
  });
});

describe('judgeReply', () => {
  const real = 'The burn was 30s shorter than planned; curious how that changes the orbit.';

  it('lets real replies through at every sensitivity', () => {
    for (const s of ['lenient', 'balanced', 'strict'] as const) expect(judgeReply({ text: real }, s).filtered).toBe(false);
  });

  it('scales with sensitivity', () => {
    // generic = 2
    expect(judgeReply({ text: 'great post' }, 'lenient').filtered).toBe(false);
    expect(judgeReply({ text: 'great post' }, 'balanced').filtered).toBe(true);
    // too short = 1, high rate = 1
    expect(judgeReply({ text: 'ok' }, 'balanced').filtered).toBe(false);
    expect(judgeReply({ text: 'ok' }, 'strict').filtered).toBe(true);
    expect(judgeReply({ text: real, level: 'warn' }, 'strict').filtered).toBe(true);
    expect(judgeReply({ text: real, level: 'warn' }, 'balanced').filtered).toBe(false);
  });

  it('filters strong signals even when lenient', () => {
    expect(judgeReply({ text: real, level: 'bot', rate: 412 }, 'lenient')).toMatchObject({ filtered: true });
    expect(judgeReply({ text: 'join t.me/x' }, 'lenient').filtered).toBe(true);
    expect(judgeReply({ text: 'follow back pls' }, 'lenient').filtered).toBe(true);
    expect(judgeReply({ text: 'great post', repeats: 3 }, 'lenient').filtered).toBe(true);
  });

  it('treats short repeats more gently than copy-pasted sentences', () => {
    expect(judgeReply({ text: 'Congrats!', repeats: 4 }, 'lenient').filtered).toBe(false);
    expect(judgeReply({ text: 'Incredible work by the whole team, history made', repeats: 1 }, 'lenient').filtered).toBe(true);
  });

  it('always filters muted keywords', () => {
    const v = judgeReply({ text: real }, 'lenient', ['orbit']);
    expect(v.filtered).toBe(true);
    expect(verdictLabel(v)).toBe('muted keyword');
  });

  it('labels and explains the strongest reason first', () => {
    const v = judgeReply({ text: '🔥🔥', level: 'bot', rate: 412 }, 'balanced');
    expect(verdictLabel(v)).toBe('likely bot');
    expect(v.signals.map((s) => s.detail)).toEqual(['Bot Meter: likely automated (412 posts a day)', 'emoji only']);
    expect(verdictLabel(judgeReply({ text: 'this' }, 'balanced'))).toBe('low effort');
    expect(verdictLabel(judgeReply({ text: 'Incredible work by the whole team', repeats: 2 }, 'balanced'))).toBe('copy-pasted');
  });
});

describe('isExempt', () => {
  const base = { threadAuthors: ['NASA'], allowlist: ['friend'] };
  it('never filters the thread authors, allowlisted accounts or people the viewer follows', () => {
    expect(isExempt({ ...base, handle: 'nasa' })).toBe(true);
    expect(isExempt({ ...base, handle: 'Friend' })).toBe(true);
    expect(isExempt({ ...base, handle: 'someone', followedByViewer: true })).toBe(true);
    expect(isExempt({ ...base, handle: 'someone' })).toBe(false);
  });
});
