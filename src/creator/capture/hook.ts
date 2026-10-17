// Page-world hook for the Creator Tools extension (Bot Meter has its own in
// src/inject.js, which this mirrors). It only reads data X's page already
// receives and makes no requests of its own:
//
//  1. First page load: X streams server-rendered results into `self.$R.tsr`
//     (TanStack Start / seroval); trap that array and read objects as they land.
//  2. Afterwards: read fetch/XHR responses from X's GraphQL API as they arrive.
//
// Both extensions can be installed together: the $R trap chains onto one that's
// already there, and fetch/XHR wrappers stack.

/** Receives each response body, with its URL (null for the server-rendered stream). */
type Sink = (data: unknown, url: string | null) => void;

export interface HookTarget {
  fetch: typeof fetch;
  XMLHttpRequest: typeof XMLHttpRequest;
  setTimeout: (fn: () => void, ms: number) => unknown;
  $R?: unknown;
}

const isApiUrl = (url: unknown): boolean =>
  typeof url === 'string' && (url.includes('/graphql/') || url.includes('/i/api/'));

export function installHook(win: HookTarget, sink: Sink): void {
  const safeSink: Sink = (data, url) => {
    try {
      sink(data, url);
    } catch {
      // Never let parsing break the page.
    }
  };

  // --- 1. server-rendered stream ---
  try {
    const pending: unknown[] = [];
    let timer: unknown = null;
    const handler: ProxyHandler<Record<PropertyKey, unknown>> = {
      set(target, key, value: unknown) {
        target[key] = value;
        if (value && typeof value === 'object') {
          pending.push(value);
          // Wait until the current <script> finishes so objects are fully built.
          timer ??= win.setTimeout(() => {
            timer = null;
            safeSink(pending.splice(0), null);
          }, 0);
        }
        return true;
      },
    };
    const wrap = (v: unknown): unknown =>
      v && typeof v === 'object' ? new Proxy(v as Record<PropertyKey, unknown>, handler) : v;
    if (!win.$R || typeof win.$R !== 'object') win.$R = {};
    const R = win.$R as object;
    const prior = Object.getOwnPropertyDescriptor(R, 'tsr');
    const priorGet = prior?.get;
    const priorSet = prior?.set;
    if (priorGet && priorSet) {
      Object.defineProperty(R, 'tsr', {
        configurable: true,
        enumerable: true,
        get: priorGet,
        set: (v: unknown) => priorSet.call(R, wrap(v)),
      });
    } else {
      let tsr = wrap((R as { tsr?: unknown }).tsr);
      Object.defineProperty(R, 'tsr', {
        configurable: true,
        enumerable: true,
        get: () => tsr,
        set: (v: unknown) => {
          tsr = wrap(v);
        },
      });
    }
  } catch {}

  // --- 2. fetch ---
  const origFetch = win.fetch;
  win.fetch = async function (this: unknown, ...args: Parameters<typeof fetch>): Promise<Response> {
    const res = await origFetch.apply(this, args);
    try {
      if (isApiUrl(res.url) && (res.headers.get('content-type') ?? '').includes('json')) {
        res
          .clone()
          .json()
          .then((data: unknown) => safeSink(data, res.url), () => {});
      }
    } catch {}
    return res;
  };

  // --- 2. XMLHttpRequest (older X client) ---
  const proto = win.XMLHttpRequest.prototype;
  const origOpen = proto.open;
  const origSend = proto.send;
  const urls = new WeakMap<XMLHttpRequest, string>();
  proto.open = function (this: XMLHttpRequest, ...args: unknown[]) {
    urls.set(this, String(args[1]));
    return (origOpen as (...a: unknown[]) => void).apply(this, args);
  } as typeof proto.open;
  proto.send = function (this: XMLHttpRequest, body?: Document | XMLHttpRequestBodyInit | null) {
    if (isApiUrl(urls.get(this))) {
      this.addEventListener('load', function (this: XMLHttpRequest) {
        const url = urls.get(this) ?? null;
        try {
          if (this.responseType === '' || this.responseType === 'text') safeSink(JSON.parse(this.responseText), url);
          else if (this.responseType === 'json') safeSink(this.response, url);
        } catch {}
      });
    }
    return origSend.call(this, body);
  };
}
