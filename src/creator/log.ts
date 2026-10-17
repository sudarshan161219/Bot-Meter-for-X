// Console logging for Creator Tools, always prefixed so it's easy to filter.
// Features call fail() when X changes something; after a few failures the
// feature switches itself off instead of spamming or breaking the page.

const PREFIX = '[BotMeter:Creator]';
const MAX_FAILURES = 5;
const failures = new Map<string, number>();
const warned = new Set<string>();

export function warnOnce(key: string, ...details: unknown[]): void {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(PREFIX, ...details);
}

/** Records a failure for `feature`; returns false once it should stay disabled. */
export function fail(feature: string, error: unknown): boolean {
  const count = (failures.get(feature) ?? 0) + 1;
  failures.set(feature, count);
  if (count === MAX_FAILURES) warnOnce(`disabled:${feature}`, `${feature} disabled after repeated errors:`, error);
  return count < MAX_FAILURES;
}

export const isDisabled = (feature: string): boolean => (failures.get(feature) ?? 0) >= MAX_FAILURES;
