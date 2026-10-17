// Reply Filter heuristics. Every rule is a pure function of the reply (text,
// links, the author's Bot Meter level) so it can be unit-tested without a page.
// The phrase lists are English; replies in other languages are judged on the
// language-independent rules (emoji-only, links, repeats, Bot Meter).

import type { Level } from '../core';

export type Sensitivity = 'lenient' | 'balanced' | 'strict';

export type Reason =
  | 'muted'
  | 'bot-meter'
  | 'high-rate'
  | 'promotion'
  | 'engagement-bait'
  | 'repeated'
  | 'generic'
  | 'emoji-only'
  | 'too-short';

export interface Signal {
  reason: Reason;
  weight: number;
  /** Shown in the tooltip. */
  detail: string;
}

/** A reply is filtered once its signals add up to this. */
export const THRESHOLDS: Readonly<Record<Sensitivity, number>> = { lenient: 3, balanced: 2, strict: 1 };

const MENTION = /(^|\s)@[A-Za-z0-9_]{1,15}\b/g;
const URL_RE = /\bhttps?:\/\/\S+|\b(?:[a-z0-9-]+\.)+[a-z]{2,}\/\S*/gi;
const EMOJI = /[\p{Extended_Pictographic}\p{Regional_Indicator}]/u;
// Emoji pieces that aren't pictographs themselves: skin tones, joiners, variation selectors, flags, keycaps.
const EMOJI_PARTS = /[\p{Extended_Pictographic}\p{Emoji_Modifier}\p{Regional_Indicator}\u200d\ufe0f\u20e3]/gu;

/** Lowercased reply text without @mentions, links or extra spaces. Used to compare replies. */
export function normalizeReply(text: string): string {
  return text
    .replace(URL_RE, ' ')
    .replace(MENTION, ' ')
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/** Just the words: no emoji, punctuation or spaces at the ends. */
const words = (normalized: string): string =>
  normalized
    .replace(EMOJI_PARTS, ' ')
    .replace(/[^\p{L}\p{N}%+'\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Only emoji (and maybe punctuation): "🔥🔥", "👏👏👏", "😂!!". */
export function isEmojiOnly(text: string): boolean {
  const n = normalizeReply(text);
  return EMOJI.test(n) && words(n) === '';
}

const GENERIC = new Set([
  '100', '100%', '+1', 'agreed', 'agree', 'amazing', 'awesome', 'based', 'beautiful', 'bingo', 'exactly',
  'facts', 'fax', 'fire', 'fr', 'great', 'great post', 'great thread', 'great point', 'good point',
  'good post', 'interesting', 'insane', 'legend', 'lfg', 'lol', 'lmao', 'love it', 'love this', 'nice',
  'nice post', 'nice one', 'real', 'so true', 'same', 'this', 'this is it', 'this is the way', 'thanks for sharing',
  'thank you for sharing', 'true', 'very true', 'well said', 'wow', 'yes', 'yep', 'yup', 'cool', 'so good',
  'big if true', 'w', 'huge', 'gm', 'gn', 'spot on', 'absolutely', 'indeed',
]);

/** A stock reply that would fit under any post: "great post", "this", "facts 💯", "so true so true". */
export function genericPhrase(text: string): string | null {
  const w = words(normalizeReply(text));
  if (!w) return null;
  if (GENERIC.has(w)) return w;
  // The same stock phrase repeated.
  const parts = w.split(' ');
  for (let size = 1; size <= parts.length / 2; size++) {
    if (parts.length % size) continue;
    const unit = parts.slice(0, size).join(' ');
    if (GENERIC.has(unit) && Array(parts.length / size).fill(unit).join(' ') === w) return unit;
  }
  return null;
}

/** Barely any words, but not a stock phrase or emoji-only (those have their own rules). */
export function isTooShort(text: string): boolean {
  const w = words(normalizeReply(text));
  if (!w || genericPhrase(text)) return false;
  // Questions are usually real conversation: "why?", "source?"
  if (text.includes('?')) return false;
  return w.replace(/\s/g, '').length <= 6;
}

// Whole words or phrases from a list, case-insensitive.
const phrases = (list: readonly string[]): RegExp =>
  new RegExp(`(?:^|[^\\p{L}\\p{N}_])(?:${list.join('|')})(?![\\p{L}\\p{N}_])`, 'iu');

const PROMO_HOSTS = /\b(?:t\.me|telegram\.(?:me|org|dog)|wa\.me|chat\.whatsapp\.com|whatsapp\.com\/channel)\b/i;
const PROMO_WORDS = phrases([
  'airdrops?',
  'presale',
  'pre-sale',
  'whitelist spots?',
  '100x',
  '1000x',
  'free (?:crypto|nft|tokens?|usdt|btc|eth|sol)',
  'claim (?:your|now|here)',
  '(?:crypto|forex|trading) signals?',
  'dm me',
  'dm for',
  'inbox me',
  'message me on',
  'contact (?:me )?(?:on|via) (?:telegram|whatsapp)',
  '(?:telegram|whatsapp) me',
  'check (?:out )?my (?:bio|profile|pinned)',
  'link in (?:my )?bio',
  'recover (?:your )?(?:lost |stolen )?(?:funds|crypto|account)',
  'investment opportunity',
  'passive income',
  'make \\$?\\d+k? (?:a|per) (?:day|week)',
  'earn \\$\\d+',
]);

/** Selling something unrelated: Telegram/WhatsApp links, airdrops, "DM me", "link in bio". */
export function promotion(text: string, urls: readonly string[] = []): string | null {
  if (PROMO_HOSTS.test(text) || urls.some((u) => PROMO_HOSTS.test(u))) return 'links to Telegram/WhatsApp';
  const m = PROMO_WORDS.exec(text);
  return m ? `promotion ("${m[0].trim()}")` : null;
}

const BAIT = phrases([
  'follow ?back',
  'f4f',
  'follow for follow',
  'follow me',
  'follow each other',
  "let'?s connect",
  "let'?s be friends",
  'who wants to connect',
  'connect with me',
  'gain followers',
  'grow (?:your|my) (?:account|followers)',
  'drop your (?:handle|@)',
  '#ifb',
  '#followback',
  'like and follow',
  'follow and like',
]);

/** Asking for follows or "connections" instead of replying to the post. */
export function engagementBait(text: string): string | null {
  const m = BAIT.exec(text.replace(/[‘’]/g, "'"));
  return m ? `engagement bait ("${m[0].trim()}")` : null;
}

/** Parses the popup's comma/line-separated lists into clean lowercase entries. */
export function parseList(raw: string): string[] {
  return [...new Set(raw.split(/[\n,]/).map((s) => s.trim().toLowerCase().replace(/^@/, '')).filter(Boolean))];
}

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** First muted keyword in the text. Words match whole; anything with symbols or emoji matches anywhere. */
export function mutedKeyword(text: string, keywords: readonly string[]): string | null {
  const lower = text.toLowerCase();
  for (const k of keywords) {
    if (!k) continue;
    const wordLike = /^[\p{L}\p{N}_ ]+$/u.test(k);
    const hit = wordLike ? phrases([escapeRe(k)]).test(lower) : lower.includes(k);
    if (hit) return k;
  }
  return null;
}

/**
 * Remembers which accounts posted each reply text in one conversation, so
 * copy-pasted replies from different accounts can be spotted. X only keeps the
 * visible replies on the page, so this accumulates as the reader scrolls.
 */
export class RepeatIndex {
  private readonly byText = new Map<string, Set<string>>();

  add(handle: string, text: string): void {
    const key = words(normalizeReply(text));
    if (!key) return;
    let who = this.byText.get(key);
    if (!who) this.byText.set(key, (who = new Set()));
    who.add(handle.toLowerCase());
  }

  /** How many other accounts posted the same reply text. */
  othersWith(handle: string, text: string): number {
    const who = this.byText.get(words(normalizeReply(text)));
    if (!who) return 0;
    return who.size - (who.has(handle.toLowerCase()) ? 1 : 0);
  }
}

export interface ReplyInput {
  text: string;
  urls?: readonly string[];
  /** The author's Bot Meter level, when their account data has been seen. */
  level?: Level | null;
  /** Posts per day, for the tooltip. */
  rate?: number | null;
  /** Other accounts that posted the same text in this conversation (RepeatIndex.othersWith). */
  repeats?: number;
}

export interface Verdict {
  filtered: boolean;
  score: number;
  signals: Signal[];
}

/** All signals for one reply, strongest first. */
export function signals(input: ReplyInput, muted: readonly string[] = []): Signal[] {
  const { text, urls = [], level = null, rate = null, repeats = 0 } = input;
  const out: Signal[] = [];
  const perDay = rate == null ? '' : ` (${Math.round(rate).toLocaleString('en-US')} posts a day)`;

  const mute = mutedKeyword(text, muted);
  if (mute) out.push({ reason: 'muted', weight: Infinity, detail: `contains muted keyword "${mute}"` });
  if (level === 'bot') out.push({ reason: 'bot-meter', weight: 3, detail: `Bot Meter: likely automated${perDay}` });
  else if (level === 'warn') out.push({ reason: 'high-rate', weight: 1, detail: `Bot Meter: high posting rate${perDay}` });

  const promo = promotion(text, urls);
  if (promo) out.push({ reason: 'promotion', weight: 3, detail: promo });
  const bait = engagementBait(text);
  if (bait) out.push({ reason: 'engagement-bait', weight: 3, detail: bait });

  if (repeats > 0) {
    // A long sentence copy-pasted by several accounts is a strong spam sign;
    // a short "congrats!" from several people often isn't.
    const long = words(normalizeReply(text)).length >= 20;
    out.push({
      reason: 'repeated',
      weight: long ? 3 : 2,
      detail: `same text as ${repeats} other account${repeats === 1 ? '' : 's'} here`,
    });
  }

  if (isEmojiOnly(text)) out.push({ reason: 'emoji-only', weight: 2, detail: 'emoji only' });
  else {
    const generic = genericPhrase(text);
    if (generic) out.push({ reason: 'generic', weight: 2, detail: `generic reply ("${generic}")` });
    else if (isTooShort(text)) out.push({ reason: 'too-short', weight: 1, detail: 'very short reply' });
  }
  return out.sort((a, b) => b.weight - a.weight);
}

export function judgeReply(input: ReplyInput, sensitivity: Sensitivity, muted: readonly string[] = []): Verdict {
  const found = signals(input, muted);
  const score = found.reduce((sum, s) => sum + s.weight, 0);
  return { filtered: score >= THRESHOLDS[sensitivity], score, signals: found };
}

/** Short label for the badge and the collapsed line. */
export function verdictLabel(verdict: Verdict): string {
  const top = verdict.signals[0]?.reason;
  if (top === 'muted') return 'muted keyword';
  if (top === 'bot-meter') return 'likely bot';
  if (top === 'promotion') return 'promotion';
  if (top === 'engagement-bait') return 'engagement bait';
  if (top === 'repeated') return 'copy-pasted';
  return 'low effort';
}

export interface ExemptInput {
  handle: string;
  /** Authors of the post being viewed and of its conversation's first post. */
  threadAuthors: readonly string[];
  allowlist: readonly string[];
  /** Whether the viewer follows this account, when X sent that. */
  followedByViewer?: boolean;
}

/** Replies that are never filtered: allowlisted accounts, people the viewer follows, the thread's own authors. */
export function isExempt({ handle, threadAuthors, allowlist, followedByViewer }: ExemptInput): boolean {
  const h = handle.toLowerCase();
  return followedByViewer === true || allowlist.includes(h) || threadAuthors.some((a) => a.toLowerCase() === h);
}
