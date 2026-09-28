// Runs in the page's MAIN world at document_start, before X's own scripts.
// X's web app already has full user objects (post count, join date,
// followers...) for every post it renders. We read them from two places and
// hand the stats to the isolated content script via postMessage. No extra
// network requests are made.
//
//  1. First page load: X server-renders and streams its GraphQL results into
//     inline <script>s that assign objects into `self.$R.tsr` (TanStack Start /
//     seroval). We trap that array and read every object as it lands.
//  2. Everything after (scrolling, navigation): fetch/XHR responses from
//     api.x.com/graphql/... are read as they arrive.
(() => {
  const SOURCE = 'bot-meter-x';

  const isApiUrl = (url) =>
    typeof url === 'string' && (url.includes('/graphql/') || url.includes('/i/api/'));

  const isoFromMs = (ms) => {
    const n = typeof ms === 'string' && ms !== '' ? Number(ms) : ms;
    return typeof n === 'number' && Number.isFinite(n) && n > 0 ? new Date(n).toISOString() : null;
  };

  function pickUser(node) {
    const core = node.core;
    const legacy = node.legacy;

    // x-web GraphQL (2026): { rest_id, core: { screen_name, created_at_ms? }, tweet_counts: { tweets },
    // relationship_counts: { followers, following }, legacy: {} }. Post authors come without
    // created_at_ms; the content script then derives the join date from rest_id.
    if (typeof node.tweet_counts?.tweets === 'number' && typeof core?.screen_name === 'string') {
      return {
        screenName: core.screen_name,
        restId: typeof node.rest_id === 'string' ? node.rest_id : null,
        name: core.name ?? '',
        createdAt: isoFromMs(core.created_at_ms),
        statuses: node.tweet_counts.tweets,
        media: legacy?.media_count ?? null,
        followers: node.relationship_counts?.followers ?? legacy?.followers_count ?? null,
        following: node.relationship_counts?.following ?? legacy?.friends_count ?? null,
        verified: Boolean(node.verification?.is_blue_verified ?? node.is_blue_verified),
      };
    }

    // x-web route loader model: { screenName, createdAtMs, tweets, followers, following }
    if (typeof node.tweets === 'number' && typeof node.screenName === 'string' && node.createdAtMs != null) {
      const createdAt = isoFromMs(node.createdAtMs);
      if (createdAt) {
        return {
          screenName: node.screenName,
          restId: typeof node.restId === 'string' ? node.restId : null,
          name: node.name ?? '',
          createdAt,
          statuses: node.tweets,
          media: null,
          followers: node.followers ?? null,
          following: node.following ?? null,
          verified: Boolean(node.isBlueVerified ?? node.isVerified),
        };
      }
    }

    // Older GraphQL: counts in legacy, screen_name/created_at in core or legacy.
    if (legacy && typeof legacy === 'object' && typeof legacy.statuses_count === 'number') {
      const screenName = core?.screen_name ?? legacy.screen_name;
      const createdAt = core?.created_at ?? legacy.created_at;
      if (screenName && createdAt) {
        return {
          screenName,
          restId: typeof node.rest_id === 'string' ? node.rest_id : null,
          name: core?.name ?? legacy.name ?? '',
          createdAt,
          statuses: legacy.statuses_count,
          media: legacy.media_count ?? null,
          followers: legacy.followers_count ?? null,
          following: legacy.friends_count ?? null,
          verified: Boolean(node.is_blue_verified || legacy.verified),
        };
      }
    }

    // Flat REST / __INITIAL_STATE__ shape: { screen_name, created_at, statuses_count, ... }
    if (typeof node.statuses_count === 'number' && node.screen_name && node.created_at) {
      return {
        screenName: node.screen_name,
        restId: typeof node.id_str === 'string' ? node.id_str : null,
        name: node.name ?? '',
        createdAt: node.created_at,
        statuses: node.statuses_count,
        media: node.media_count ?? null,
        followers: node.followers_count ?? null,
        following: node.friends_count ?? null,
        verified: Boolean(node.is_blue_verified || node.verified),
      };
    }
    return null;
  }

  // Tweets can arrive wrapped: { result: { __typename: 'TweetWithVisibilityResults', tweet: {...} } }.
  function unwrapTweet(x) {
    let t = x?.result ?? x;
    if (t?.tweet) t = t.tweet;
    return t && typeof t === 'object' ? t : null;
  }

  // Replies, reposts and quotes, so the content script can honor the
  // "show badges on" toggles. Plain posts aren't reported.
  function pickPost(node) {
    if (typeof node.rest_id !== 'string' || !(node.__typename === 'Tweet' || node.core?.user_results)) return null;
    const legacy = node.legacy;
    const reply = Boolean(node.reply_to_results?.rest_id || legacy?.in_reply_to_status_id_str);
    const original = unwrapTweet(legacy?.retweeted_status_results ?? legacy?.retweeted_status_result);
    const quoted = unwrapTweet(node.quoted_tweet_results ?? node.quoted_status_result);
    const quotedAuthor = quoted?.core?.user_results?.result;
    if (!reply && !original?.rest_id && !quoted?.rest_id) return null;
    return {
      id: node.rest_id,
      reply,
      repostOf: original?.rest_id ?? null,
      quotedId: quoted?.rest_id ?? null,
      quotedAuthor: quotedAuthor?.core?.screen_name ?? quotedAuthor?.legacy?.screen_name ?? null,
    };
  }

  function collect(root) {
    const found = new Map();
    const posts = [];
    const stack = [root];
    const seen = new Set();
    while (stack.length) {
      const node = stack.pop();
      if (!node || typeof node !== 'object' || seen.has(node)) continue;
      seen.add(node);
      if (!Array.isArray(node)) {
        const user = pickUser(node);
        if (user) {
          // The same account can appear with and without its join date; keep the richer fields.
          const key = user.screenName.toLowerCase();
          const merged = { ...found.get(key) };
          for (const [k, v] of Object.entries(user)) if (v != null) merged[k] = v;
          found.set(key, merged);
        }
        const post = pickPost(node);
        if (post) posts.push(post);
      }
      for (const key in node) {
        let v;
        try {
          v = node[key];
        } catch {
          continue;
        }
        if (v && typeof v === 'object') stack.push(v);
      }
    }
    return { users: [...found.values()], posts };
  }

  function publish(data) {
    try {
      const { users, posts } = collect(data);
      if (users.length || posts.length) {
        window.postMessage({ source: SOURCE, type: 'users', users, posts }, window.location.origin);
      }
    } catch {
      // Never let our parsing break the page.
    }
  }

  // --- 1. server-rendered stream (first page load) ---
  try {
    const pending = [];
    let timer = null;
    const flush = () => {
      timer = null;
      publish(pending.splice(0));
    };
    const handler = {
      set(target, key, value) {
        target[key] = value;
        if (value && typeof value === 'object') {
          pending.push(value);
          // Wait until the current <script> finishes so objects are fully built.
          timer ??= setTimeout(flush, 0);
        }
        return true;
      },
    };
    const R = window.$R && typeof window.$R === 'object' ? window.$R : (window.$R = {});
    let tsr = R.tsr && typeof R.tsr === 'object' ? new Proxy(R.tsr, handler) : R.tsr;
    Object.defineProperty(R, 'tsr', {
      configurable: true,
      enumerable: true,
      get: () => tsr,
      set: (v) => {
        tsr = v && typeof v === 'object' ? new Proxy(v, handler) : v;
      },
    });
  } catch {}

  // --- 2. fetch ---
  const origFetch = window.fetch;
  window.fetch = async function (...args) {
    const res = await origFetch.apply(this, args);
    try {
      if (isApiUrl(res.url) && (res.headers.get('content-type') || '').includes('json')) {
        res.clone().json().then(publish, () => {});
      }
    } catch {}
    return res;
  };

  // --- 2. XMLHttpRequest (older X client) ---
  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;
  const urls = new WeakMap();

  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    urls.set(this, String(url));
    return origOpen.call(this, method, url, ...rest);
  };

  XMLHttpRequest.prototype.send = function (...args) {
    if (isApiUrl(urls.get(this))) this.addEventListener('load', onXhrLoad);
    return origSend.apply(this, args);
  };

  function onXhrLoad() {
    try {
      if (this.responseType === '' || this.responseType === 'text') publish(JSON.parse(this.responseText));
      else if (this.responseType === 'json') publish(this.response);
    } catch {}
  }

  // --- data embedded in the initial HTML by the older X client ---
  document.addEventListener('DOMContentLoaded', () => {
    if (window.__INITIAL_STATE__) publish(window.__INITIAL_STATE__);
  });
})();
