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

  // First boolean among the candidates, or null when X didn't send the field
  // (so merging records never turns a known "true" into "false").
  const flag = (...vals) => vals.find((v) => typeof v === 'boolean') ?? null;

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
        verifiedType: node.verification?.verified_type ?? null,
        // X's own "sensitive account" flag; its profile pages map it to rating=adult.
        sensitive: flag(node.possibly_sensitive, legacy?.possibly_sensitive),
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
          sensitive: flag(node.possiblySensitive),
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
          sensitive: flag(legacy.possibly_sensitive, node.possibly_sensitive),
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
        sensitive: flag(node.possibly_sensitive),
      };
    }
    return null;
  }

  // X's "About this account" panel (AboutAccountQuery). Only loaded when the
  // viewer opens it, so these facts exist just for accounts they've looked at.
  function pickAbout(node) {
    const about = node.about_profile;
    const screenName = node.core?.screen_name;
    if (!about || typeof about !== 'object' || typeof screenName !== 'string') return null;
    const int = (v) => {
      const n = Number.parseInt(v ?? '', 10);
      return Number.isFinite(n) ? n : null;
    };
    return {
      screenName,
      basedIn: typeof about.account_based_in === 'string' ? about.account_based_in : null,
      connectedVia: typeof about.source === 'string' ? about.source : null,
      handleChanges: int(about.username_changes?.count),
      lastHandleChangeMs: int(about.username_changes?.last_changed_at_msec),
    };
  }

  // Tweets can arrive wrapped: { result: { __typename: 'TweetWithVisibilityResults', tweet: {...} } }.
  function unwrapTweet(x) {
    let t = x?.result ?? x;
    if (t?.tweet) t = t.tweet;
    return t && typeof t === 'object' ? t : null;
  }

  // Media carries X's adult-content warning when the uploader or X flagged it.
  function hasAdultMedia(node) {
    const lists = [node.legacy?.extended_entities?.media, node.legacy?.entities?.media, node.media_entities2, node.media_entities];
    for (const list of lists) {
      if (!Array.isArray(list)) continue;
      for (const m of list) {
        const warning = m?.sensitive_media_warning ?? m?.ext_sensitive_media_warning ?? m?.ext?.sensitiveMediaWarning?.r?.ok;
        if (warning?.adult_content === true || warning?.adultContent === true) return true;
      }
    }
    return false;
  }

  // Replies, reposts, quotes and sensitive posts, so the content script can
  // honor its toggles. Plain posts aren't reported.
  function pickPost(node) {
    if (typeof node.rest_id !== 'string' || !(node.__typename === 'Tweet' || node.core?.user_results)) return null;
    const legacy = node.legacy;
    const reply = Boolean(node.reply_to_results?.rest_id || legacy?.in_reply_to_status_id_str);
    const original = unwrapTweet(legacy?.retweeted_status_results ?? legacy?.retweeted_status_result);
    const quoted = unwrapTweet(node.quoted_tweet_results ?? node.quoted_status_result);
    const quotedAuthor = quoted?.core?.user_results?.result;
    // X shows its own "sensitive content" warning for these posts.
    const sensitive = legacy?.possibly_sensitive === true || node.possibly_sensitive === true || hasAdultMedia(node);
    if (!reply && !original?.rest_id && !quoted?.rest_id && !sensitive) return null;
    return {
      id: node.rest_id,
      reply,
      repostOf: original?.rest_id ?? null,
      quotedId: quoted?.rest_id ?? null,
      quotedAuthor: quotedAuthor?.core?.screen_name ?? quotedAuthor?.legacy?.screen_name ?? null,
      sensitive,
    };
  }

  // Timeline entries for ads carry promoted_metadata next to the post itself:
  // { __typename: 'TimelineTweet', tweet_results: {...}, promoted_metadata: { disclosure_type, impression_id } }.
  function pickPromoted(node) {
    const meta = node.promoted_metadata ?? node.promotedMetadata;
    if (!meta || typeof meta !== 'object') return null;
    const tweet = unwrapTweet(node.tweet_results ?? node.tweetResults ?? node.tweet);
    return typeof tweet?.rest_id === 'string' ? tweet.rest_id : null;
  }

  // Sidebar/feed boxes X builds as timeline modules: account suggestions ("Who to
  // follow", "Creators for you"…) have user items, "What's happening" has trend
  // items. X sends their heading in the reader's language, so we pass the heading
  // and "Show more" link on for matching.
  function pickModule(node) {
    if (!Array.isArray(node.items) || !node.items.length) return null;
    const typeOf = (entry) => {
      const c = entry?.item?.content ?? entry?.item?.itemContent ?? entry?.item;
      const t = c?.__typename ?? c?.itemType;
      if (t === 'TimelineUser' || c?.user_results) return 'people';
      if (t === 'TimelineTrend' || c?.trend) return 'trends';
      return null;
    };
    const kind = node.items.map(typeOf).find(Boolean);
    if (!kind) return null;
    const header = node.header?.text ?? node.header?.title ?? null;
    const url = node.footer?.landing_url?.url ?? node.footer?.url ?? null;
    if (typeof header !== 'string' && typeof url !== 'string') return null;
    return { kind, header: typeof header === 'string' ? header : null, url: typeof url === 'string' ? url : null };
  }

  function collect(root) {
    const found = new Map();
    const posts = [];
    const promoted = [];
    const modules = [];
    const about = [];
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
        const ad = pickPromoted(node);
        if (ad) promoted.push(ad);
        const module = pickModule(node);
        if (module) modules.push(module);
        const info = pickAbout(node);
        if (info) about.push(info);
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
    return { users: [...found.values()], posts, promoted, modules, about };
  }

  // Creator Tools' parser (src/gen/creator-main.js, loaded just before this file)
  // turns the same responses into normalized posts. It's optional and isolated:
  // after a few errors it's skipped for the rest of the page, so Bot Meter's own
  // scoring never depends on it.
  const CREATOR_PARSE = Symbol.for('botmeter.creator.parse');
  let creatorErrors = 0;
  function creatorParse(data) {
    const parse = window[CREATOR_PARSE];
    if (typeof parse !== 'function' || creatorErrors >= 5) return null;
    try {
      return parse(data);
    } catch (error) {
      if (++creatorErrors === 5) console.warn('[BotMeter:Creator] capture disabled after repeated parse errors', error);
      return null;
    }
  }

  function publish(data) {
    try {
      const { users, posts, promoted, modules, about } = collect(data);
      const creator = creatorParse(data);
      const tweets = creator?.tweets ?? [];
      const authors = creator?.authors ?? [];
      if (users.length || posts.length || promoted.length || modules.length || about.length || tweets.length) {
        window.postMessage(
          { source: SOURCE, type: 'users', users, posts, promoted, modules, about, tweets, authors },
          window.location.origin
        );
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
    // Another copy of this script (e.g. the Creator Tools extension) may have
    // trapped tsr already: chain onto its getter/setter so both keep working.
    const prior = Object.getOwnPropertyDescriptor(R, 'tsr');
    const wrap = (v) => (v && typeof v === 'object' ? new Proxy(v, handler) : v);
    if (prior?.set && prior.get) {
      Object.defineProperty(R, 'tsr', {
        configurable: true,
        enumerable: true,
        get: prior.get,
        set: (v) => prior.set(wrap(v)),
      });
    } else {
      let tsr = wrap(R.tsr);
      Object.defineProperty(R, 'tsr', {
        configurable: true,
        enumerable: true,
        get: () => tsr,
        set: (v) => {
          tsr = wrap(v);
        },
      });
    }
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

  // --- 3. sidebar headings in the reader's language ---
  // Some boxes ("Subscribe to Premium", "Live on X", "What's happening"…) are
  // titled by X's own translations rather than by data. Ask X's i18n for the
  // current wording so the content script can match it in any language.
  const HEADING_KEYS = {
    people: ['Who to follow', 'You might like', 'Creators for you'],
    trends: ['What’s happening', 'Trends for you'],
    premium: ['Subscribe to Premium'],
    live: ['Live on X'],
  };
  let lastHeadings = '';
  function publishHeadings() {
    try {
      const matches = window.__TSR_ROUTER__?.state?.matches ?? [];
      const i18n = matches.find((m) => typeof m?.context?.i18n?.t === 'function')?.context.i18n;
      if (!i18n) return;
      const modules = [];
      for (const [kind, keys] of Object.entries(HEADING_KEYS)) {
        for (const key of keys) {
          const header = i18n.t(key);
          if (typeof header === 'string' && header) modules.push({ kind, header, url: null });
        }
      }
      const json = JSON.stringify(modules);
      if (json === lastHeadings) return;
      lastHeadings = json;
      window.postMessage({ source: SOURCE, type: 'users', users: [], posts: [], promoted: [], modules }, window.location.origin);
    } catch {}
  }
  // Translations load lazily, so look again for a while after the page opens.
  let headingChecks = 0;
  const headingTimer = setInterval(() => {
    publishHeadings();
    if (++headingChecks >= 40) clearInterval(headingTimer);
  }, 3000);

  // --- data embedded in the initial HTML by the older X client ---
  document.addEventListener('DOMContentLoaded', () => {
    if (window.__INITIAL_STATE__) publish(window.__INITIAL_STATE__);
    publishHeadings();
  });
})();
