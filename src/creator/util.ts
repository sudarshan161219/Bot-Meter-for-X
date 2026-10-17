// Tiny helpers for reading untyped JSON (X's responses, postMessage payloads)
// without `any`.

export type Obj = Record<string, unknown>;

export const isObj = (x: unknown): x is Obj => typeof x === 'object' && x !== null && !Array.isArray(x);

export const str = (x: unknown): string | null => (typeof x === 'string' ? x : null);

/** Numbers, including X's numeric strings ("923227"). */
export const num = (x: unknown): number | null => {
  if (typeof x === 'number') return Number.isFinite(x) ? x : null;
  if (typeof x === 'string' && x.trim() !== '') {
    const n = Number(x);
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

export const arr = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);

/** Safe nested read: get(o, 'a', 'b') is o?.a?.b for unknown values. */
export const get = (o: unknown, ...path: string[]): unknown => {
  let cur = o;
  for (const key of path) {
    if (!isObj(cur)) return undefined;
    cur = cur[key];
  }
  return cur;
};

const SNOWFLAKE_MIN = 10n ** 15n;
const SNOWFLAKE_EPOCH = 1288834974657n;

/** Creation time encoded in a Snowflake ID (posts since 2010, accounts since 2016). */
export function snowflakeTime(id: string): number | null {
  if (!/^\d{1,20}$/.test(id)) return null;
  const big = BigInt(id);
  return big >= SNOWFLAKE_MIN ? Number((big >> 22n) + SNOWFLAKE_EPOCH) : null;
}

export const parseDate = (s: string | null): number | null => {
  if (!s) return null;
  const ms = Date.parse(s);
  return Number.isFinite(ms) ? ms : null;
};
