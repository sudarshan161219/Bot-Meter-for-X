// Auto-suggested tags from keyword rules the reader can edit, e.g.
// "ai: llm, gpt, openai". Pure.

import type { Tweet } from '../types';
import { normalizeTag } from './model';

export interface TagRule {
  tag: string;
  keywords: string[];
}

export const DEFAULT_RULES: readonly TagRule[] = [
  { tag: 'ai', keywords: ['ai', 'llm', 'llms', 'gpt', 'chatgpt', 'claude', 'openai', 'anthropic', 'gemini', 'machine learning', 'prompt', 'agents'] },
  { tag: 'dev', keywords: ['code', 'coding', 'programming', 'developer', 'javascript', 'typescript', 'python', 'rust', 'react', 'github', 'api', 'sql'] },
  { tag: 'design', keywords: ['design', 'designer', 'figma', 'ui', 'ux', 'typography', 'font', 'branding'] },
  { tag: 'startup', keywords: ['startup', 'founder', 'founders', 'saas', 'yc', 'fundraising', 'mrr', 'arr', 'product market fit', 'indie hacker'] },
  { tag: 'marketing', keywords: ['marketing', 'seo', 'growth', 'newsletter', 'copywriting', 'audience', 'funnel', 'conversion'] },
  { tag: 'writing', keywords: ['writing', 'writer', 'essay', 'book', 'books', 'blog', 'storytelling'] },
  { tag: 'finance', keywords: ['stocks', 'investing', 'investment', 'portfolio', 'etf', 'inflation', 'interest rates', 'personal finance'] },
  { tag: 'crypto', keywords: ['bitcoin', 'btc', 'ethereum', 'eth', 'crypto', 'web3', 'defi', 'solana', 'nft'] },
  { tag: 'health', keywords: ['health', 'fitness', 'sleep', 'diet', 'nutrition', 'workout', 'exercise', 'mental health'] },
  { tag: 'career', keywords: ['career', 'hiring', 'job', 'jobs', 'interview', 'resume', 'salary', 'remote work'] },
  { tag: 'learning', keywords: ['tutorial', 'guide', 'how to', 'tips', 'lesson', 'lessons', 'course', 'thread'] },
  { tag: 'video', keywords: ['youtube', 'youtu.be', 'video', 'podcast'] },
];

/** One rule per line: "tag: keyword, another keyword". Blank lines and lines without ":" are skipped. */
export function parseRules(text: string): TagRule[] {
  const rules: TagRule[] = [];
  for (const line of text.split('\n')) {
    const at = line.indexOf(':');
    if (at < 0) continue;
    const tag = normalizeTag(line.slice(0, at));
    const keywords = [...new Set(line.slice(at + 1).split(',').map((k) => k.trim().toLowerCase()).filter(Boolean))];
    if (tag && keywords.length) rules.push({ tag, keywords });
  }
  return rules;
}

export const formatRules = (rules: readonly TagRule[]): string => rules.map((r) => `${r.tag}: ${r.keywords.join(', ')}`).join('\n');

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Compiled rule matchers, cached per rule list.
const compiled = new WeakMap<readonly TagRule[], { tag: string; re: RegExp }[]>();
function matchers(rules: readonly TagRule[]): { tag: string; re: RegExp }[] {
  let list = compiled.get(rules);
  if (!list) {
    list = rules.map((r) => ({
      tag: r.tag,
      re: new RegExp(`(?:^|[^\\p{L}\\p{N}_])(?:${r.keywords.map(escapeRe).join('|')})(?![\\p{L}\\p{N}_])`, 'iu'),
    }));
    compiled.set(rules, list);
  }
  return list;
}

/** Tags whose keywords appear in the post's text or links, minus those it already has. */
export function suggestTags(tweet: Tweet, rules: readonly TagRule[], existing: readonly string[] = []): string[] {
  const haystack = `${tweet.text}\n${tweet.urls.join('\n')}`;
  return matchers(rules)
    .filter((m) => !existing.includes(m.tag) && m.re.test(haystack))
    .map((m) => m.tag);
}
