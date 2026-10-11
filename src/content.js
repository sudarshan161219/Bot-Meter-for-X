// Isolated-world content script: receives user stats from inject.js and
// decorates the X page with posts/day badges.
(() => {
  const SOURCE = 'bot-meter-x';
  const DEFAULTS = globalThis.BOT_METER_DEFAULTS;
  const { computeStats, formatBadge, formatPhrase, formatAge, describe, hasAdultWords } = globalThis.BotMeterStats;
  const HANDLE_RE = /^[A-Za-z0-9_]{1,15}$/;
  const PROFILE_TABS = new Set(['with_replies', 'media', 'reposts', 'highlights', 'articles', 'likes', 'superfollows', 'affiliates']);

  const users = new Map(); // lowercased handle -> user record from inject.js
  const aboutInfo = new Map(); // lowercased handle -> "About this account" facts (only for panels the viewer opened)
  const revealed = new Set(); // "bot:<handle>" / "adult:<handle>" the viewer chose to show anyway
  // Post kinds, keyed by the post ID that appears in the page's /status/<id> links.
  const replies = new Set(); // IDs of replies
  const reposts = new Set(); // IDs of posts that showed up as someone's repost
  const quotedAuthorOf = new Map(); // quoting post ID -> lowercased author of the quoted post
  const sensitivePosts = new Set(); // IDs of posts X flags as sensitive
  const promotedPosts = new Set(); // IDs of ads (timeline entries with promoted_metadata)
  // Boxes the "Hide" switches remove. Headings start with English defaults and
  // grow with the headings X actually sends (in the reader's language).
  const BOXES = {
    people: {
      setting: 'hideWhoToFollow',
      headers: new Set(['who to follow', 'you might like', 'creators for you']),
      paths: new Set(['/i/connect_people']),
      // On X's own suggestions page, the suggestions are the content.
      homePage: (path) => path.startsWith('/i/connect_people') || path.endsWith('/who_to_follow'),
    },
    trends: {
      setting: 'hideTrends',
      headers: new Set(["what's happening", 'trends for you', 'trending now', "what's trending"]),
      paths: new Set(['/explore/tabs/for-you', '/explore/tabs/trending']),
      homePage: (path) => path.startsWith('/explore') || path.startsWith('/search'),
    },
    premium: {
      setting: 'hidePremium',
      headers: new Set(['subscribe to premium']),
      // Matched by heading only: the sign-up link is also the left menu's "Premium" item.
      paths: new Set(),
      homePage: (path) => path.startsWith('/i/premium') || path.startsWith('/i/verified'),
    },
    live: {
      setting: 'hideLive',
      headers: new Set(['live on x']),
      paths: new Set(),
      homePage: (path) => path.startsWith('/i/broadcasts') || path.startsWith('/i/spaces'),
    },
  };
  const HEADINGS = 'h1, h2, h3, h4, [role="heading"]';
  // Never grow a box into these: posts, the search box, or X's left menu
  // (the only place with a Home link; it also holds the account switcher).
  const NEVER_INSIDE = 'article, input, [role="search"], a[href="/home"]';
  const norm = (text) => text.trim().toLowerCase().replace(/[‘’]/g, "'");
  let settings = { ...DEFAULTS };
  let scanTimer = null;

  chrome.storage.sync.get(DEFAULTS, (stored) => {
    settings = { ...DEFAULTS, ...stored };
    scheduleScan();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    for (const [key, { newValue }] of Object.entries(changes)) {
      if (key in DEFAULTS) settings[key] = newValue ?? DEFAULTS[key];
    }
    scheduleScan();
  });

  window.addEventListener('message', (event) => {
    const data = event.data;
    if (event.source !== window || data?.source !== SOURCE || data.type !== 'users') return;
    if (!Array.isArray(data.users)) return;
    let changed = false;
    for (const u of data.users) {
      if (!u || typeof u.screenName !== 'string' || !HANDLE_RE.test(u.screenName)) continue;
      if (typeof u.statuses !== 'number') continue;
      if (typeof u.createdAt !== 'string' && typeof u.restId !== 'string') continue;
      const key = u.screenName.toLowerCase();
      const prev = users.get(key);
      // Profiles carry the exact join date, posts don't: keep whatever we already know.
      const merged = { ...prev };
      for (const [k, v] of Object.entries(u)) if (v != null) merged[k] = v;
      if (
        !prev ||
        prev.statuses !== merged.statuses ||
        prev.createdAt !== merged.createdAt ||
        prev.followers !== merged.followers ||
        prev.sensitive !== merged.sensitive
      ) {
        changed = true;
      }
      users.set(key, merged);
    }
    for (const p of Array.isArray(data.posts) ? data.posts : []) {
      if (!p || typeof p.id !== 'string') continue;
      if (p.reply === true && !replies.has(p.id)) {
        replies.add(p.id);
        changed = true;
      }
      if (typeof p.repostOf === 'string' && !reposts.has(p.repostOf)) {
        reposts.add(p.repostOf);
        changed = true;
      }
      if (p.sensitive === true && !sensitivePosts.has(p.id)) {
        sensitivePosts.add(p.id);
        changed = true;
      }
      if (typeof p.quotedAuthor === 'string' && !quotedAuthorOf.has(p.id)) {
        quotedAuthorOf.set(p.id, p.quotedAuthor.toLowerCase());
        changed = true;
      }
    }
    for (const a of Array.isArray(data.about) ? data.about : []) {
      if (!a || typeof a.screenName !== 'string' || !HANDLE_RE.test(a.screenName)) continue;
      const key = a.screenName.toLowerCase();
      const facts = {
        basedIn: typeof a.basedIn === 'string' ? a.basedIn : null,
        connectedVia: typeof a.connectedVia === 'string' ? a.connectedVia : null,
        handleChanges: Number.isInteger(a.handleChanges) ? a.handleChanges : null,
        lastHandleChangeMs: Number.isInteger(a.lastHandleChangeMs) ? a.lastHandleChangeMs : null,
      };
      if (JSON.stringify(aboutInfo.get(key)) !== JSON.stringify(facts)) {
        aboutInfo.set(key, facts);
        changed = true;
      }
    }
    for (const id of Array.isArray(data.promoted) ? data.promoted : []) {
      if (typeof id === 'string' && !promotedPosts.has(id)) {
        promotedPosts.add(id);
        changed = true;
      }
    }
    for (const m of Array.isArray(data.modules) ? data.modules : []) {
      const box = BOXES[m?.kind];
      if (!box) continue;
      const header = typeof m.header === 'string' ? norm(m.header) : '';
      if (header && !box.headers.has(header)) {
        box.headers.add(header);
        changed = true;
      }
      const path = typeof m.url === 'string' ? pathOf(m.url) : null;
      if (path && !box.paths.has(path)) {
        box.paths.add(path);
        changed = true;
      }
    }
    if (changed) scheduleScan();
  });

  function pathOf(url) {
    try {
      return new URL(url, location.origin).pathname.toLowerCase();
    } catch {
      return null;
    }
  }

  // --- scanning ---

  function scheduleScan() {
    if (scanTimer) return;
    scanTimer = setTimeout(() => {
      scanTimer = null;
      scan();
    }, 100);
  }

  function scan() {
    const focalId = location.pathname.match(/\/status\/(\d+)/)?.[1];
    const decorated = new Set();
    const handled = new Set();
    const hidden = new Set(); // elements removed from view (ads, suggestion boxes)

    for (const article of document.querySelectorAll('article')) {
      // Author links that belong to this post (not to a nested quoted post).
      const links = [];
      for (const link of article.querySelectorAll('a[href^="/"]')) {
        if (link.closest('article') !== article) continue;
        const handle = authorHandle(link);
        if (handle) links.push({ link, handle });
      }
      const author = links[0]?.handle ?? null;
      const id = postId(article, author);
      if (isHiddenAd(article, id)) {
        hidden.add(article.closest('[data-timeline-entry]') ?? article);
        for (const { link } of links) handled.add(link);
        syncArticle(article, author, null, null);
        continue;
      }
      const checked = isChecked(postKind(article, id, focalId));
      const quotedAuthor = id ? quotedAuthorOf.get(id) : undefined;
      // Adult checks run on every post, whatever the bot-check toggles say.
      const adult = adultReason(article, author, id, links[0]?.link);
      links.forEach(({ link, handle }, i) => {
        handled.add(link);
        // Later author links in a post are usually the quoted post's author.
        const isQuoted = i > 0 && handle.toLowerCase() === quotedAuthor;
        const on = isQuoted ? settings.onQuotes : checked;
        const label = i === 0 && settings.adultAction === 'label' ? adult : null;
        decorated.add(decorateHandleLink(link, on ? handle : null, label));
      });
      // Only the post's own author decides dimming/collapsing.
      syncArticle(article, author, checked ? lookup(author) : null, adult);
    }

    // Author links outside posts: user lists, hover cards, "who to follow".
    for (const link of document.querySelectorAll('a[href^="/"]')) {
      if (handled.has(link)) continue;
      const handle = authorHandle(link);
      if (handle) decorated.add(decorateHandleLink(link, handle));
    }

    // Drop badges whose link X re-rendered or removed.
    for (const badge of document.querySelectorAll('.bm-badge:not(.bm-profile)')) {
      if (!decorated.has(badge)) badge.remove();
    }

    if (settings.enabled) {
      for (const box of Object.values(BOXES)) {
        if (settings[box.setting]) for (const el of findBoxes(box)) hidden.add(el);
      }
    }
    for (const el of document.querySelectorAll('.bm-hidden')) {
      if (!hidden.has(el)) el.classList.remove('bm-hidden');
    }
    for (const el of hidden) {
      if (!el.classList.contains('bm-hidden')) el.classList.add('bm-hidden');
    }

    decorateProfile();
  }

  // Ads: X's promoted_metadata, or (fallback, English UI) an "Ad"/"Promoted" label in the post.
  function isHiddenAd(article, id) {
    if (!settings.enabled || !settings.hidePromoted || article.parentElement?.closest('article')) return false;
    if (id && promotedPosts.has(id)) return true;
    for (const el of article.querySelectorAll('span, div')) {
      if (el.childElementCount !== 0 || el.closest('article') !== article || el.closest('[dir="auto"], a')) continue;
      const text = el.textContent.trim();
      if (text === 'Ad' || text === 'Promoted') return true;
    }
    return false;
  }

  // Elements to hide for one kind of box ("Who to follow", "What's happening"),
  // in the feed and the sidebar.
  function findBoxes(box) {
    const found = new Set();
    const path = location.pathname.toLowerCase();
    if (box.homePage(path)) return found;
    const add = (el) => {
      if (!el) return;
      found.add(el);
      // Outside the feed, also drop empty divider/frame elements right next to it.
      if (!el.closest('main, [role="main"]')) {
        for (const sib of [el.previousElementSibling, el.nextElementSibling]) if (sib && isBlank(sib)) found.add(sib);
      }
    };
    const opensWithHeader = (text) => {
      for (const h of box.headers) if (text.startsWith(h)) return true;
      return false;
    };
    // Feed: a timeline entry with no posts that opens with the box's heading.
    for (const entry of document.querySelectorAll('[data-timeline-entry]')) {
      if (!entry.querySelector('article') && opensWithHeader(norm(entry.textContent))) add(wrapper(entry));
    }
    // The card around a title matching this kind of box (a heading tag, or plain
    // text: X doesn't always mark card titles up as headings)…
    for (const title of titlesOutsideFeed()) {
      if (box.headers.has(norm(title.textContent))) add(cardAround(title));
    }
    // …or around its "Show more" link.
    for (const a of document.querySelectorAll('a[href]')) {
      // The left menu's own links aren't boxes.
      if (a.closest('nav, header, [role="navigation"]')) continue;
      const p = a.getAttribute('href').split(/[?#]/)[0].toLowerCase();
      if (box.paths.has(p) || (box === BOXES.people && p.endsWith('/who_to_follow'))) add(cardAround(a));
    }
    return found;
  }

  // Heading tags anywhere, plus elements whose own text could be a card title,
  // skipping the feed, posts and menus (their text is never a sidebar title).
  function titlesOutsideFeed() {
    const titles = new Set(document.querySelectorAll(HEADINGS));
    const skip = 'main, [role="main"], article, nav, header, script, style, [data-timeline-entry]';
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode: (node) =>
        node.nodeType === Node.ELEMENT_NODE
          ? node.matches(skip)
            ? NodeFilter.FILTER_REJECT
            : NodeFilter.FILTER_SKIP
          : node.textContent.trim().length > 2 && node.textContent.length < 60
            ? NodeFilter.FILTER_ACCEPT
            : NodeFilter.FILTER_SKIP,
    });
    for (let node = walker.nextNode(); node; node = walker.nextNode()) titles.add(node.parentElement);
    return titles;
  }

  // The whole card around `start` (a heading or "Show more" link): climb until
  // the card's content is included, then only through wrappers that hold
  // nothing else (frames, borders), so neighbouring cards are never swallowed.
  function cardAround(start) {
    if (start.closest('article')) return null;
    const entry = start.closest('[data-timeline-entry]');
    if (entry) return entry.querySelector('article') ? null : wrapper(entry);
    const startText = start.textContent.trim().length;
    let el = start;
    while (el.parentElement) {
      const p = el.parentElement;
      if (p === document.body || p.matches('main, [role="main"], nav, header, aside, [role="complementary"]')) break;
      if (p.querySelector(NEVER_INSIDE)) break;
      if (p.querySelectorAll(HEADINGS).length > 1) break;
      // Once `el` holds more than the heading/link itself, it is the card:
      // keep climbing only while the parent has nothing else in it.
      const hasCard = el.textContent.trim().length > startText;
      if (hasCard && ![...p.children].every((c) => c === el || isBlank(c))) break;
      el = p;
    }
    return el === start ? null : el;
  }

  // Grow `el` over parents that hold nothing else (empty wrappers, border frames).
  function wrapper(el) {
    for (let i = 0; i < 6 && el.parentElement; i++) {
      const p = el.parentElement;
      if (p === document.body || p.matches('main, [role="main"]') || p.querySelector(NEVER_INSIDE)) break;
      if (![...p.children].every((c) => c === el || isBlank(c))) break;
      el = p;
    }
    return el;
  }

  // No text and no media: a spacer, divider line or empty frame.
  function isBlank(el) {
    return !el.textContent.trim() && !el.querySelector('img, video, svg, canvas, iframe, input, button');
  }

  // The post's own ID, from its permalink (/<author>/status/<id>).
  function postId(article, author) {
    if (!author) return null;
    const prefix = `/${author.toLowerCase()}/status/`;
    for (const a of article.querySelectorAll('a[href*="/status/"]')) {
      if (a.closest('article') !== article) continue;
      const href = a.getAttribute('href').toLowerCase();
      if (href.startsWith(prefix)) return href.slice(prefix.length).match(/^\d+/)?.[0] ?? null;
    }
    return null;
  }

  function postKind(article, id, focalId) {
    if (article.parentElement?.closest('article')) return 'quote';
    // The post a thread page is about is always checked, whatever it is.
    if (!id || id === focalId) return null;
    if (reposts.has(id)) return 'repost';
    if (replies.has(id)) return 'reply';
    return null;
  }

  // Why a post counts as adult content, or null. X's own flags first, then words.
  function adultReason(article, author, id, authorLink) {
    if (!settings.enabled || settings.adultAction === 'off') return null;
    if (id && sensitivePosts.has(id)) return 'X marks this post as sensitive';
    if (author && users.get(author.toLowerCase())?.sensitive === true) return 'X marks this account as sensitive';
    if (!settings.adultWords) return null;
    let text = displayName(article, author, authorLink);
    for (const el of article.querySelectorAll('[dir="auto"]')) {
      if (el.closest('article') === article) text += `\n${el.textContent}`;
    }
    return hasAdultWords(text) ? 'Matches adult words (NSFW, 18+, OnlyFans…)' : null;
  }

  // The author's display name: the link to their profile that isn't the @handle.
  function displayName(article, author, authorLink) {
    if (!author) return '';
    const href = `/${author.toLowerCase()}`;
    for (const a of article.querySelectorAll('a[href^="/"]')) {
      if (a === authorLink || a.closest('article') !== article) continue;
      if (a.getAttribute('href').toLowerCase() === href && !a.textContent.trim().startsWith('@')) return a.textContent;
    }
    return '';
  }

  function isChecked(kind) {
    if (kind === 'reply') return settings.onReplies;
    if (kind === 'repost') return settings.onReposts;
    if (kind === 'quote') return settings.onQuotes;
    return true;
  }

  function lookup(handle) {
    if (!settings.enabled || !handle) return null;
    const key = handle.toLowerCase();
    const base = users.get(key);
    if (!base) return null;
    const about = aboutInfo.get(key);
    const user = about ? { ...base, ...about, aboutKnown: true } : base;
    const stats = computeStats(user, settings);
    return stats ? { user, stats } : null;
  }

  // A link like <a href="/jack">@jack</a> that isn't an @mention inside post text.
  function authorHandle(link) {
    const handle = link.getAttribute('href').slice(1);
    if (!HANDLE_RE.test(handle)) return null;
    if (link.textContent.trim().toLowerCase() !== `@${handle.toLowerCase()}`) return null;
    // Post text (and bios) are rendered in dir="auto" blocks; skip mentions there.
    if (link.closest('[dir="auto"]')) return null;
    return handle;
  }

  // The badge goes right after the @handle, but only inside a container that
  // lays its children out on one line. Some layouts (e.g. ads) wrap the handle
  // in a column, where a sibling badge would drop onto its own line; there we
  // climb to the enclosing name/handle row and sit next to it instead.
  const anchors = new WeakMap();
  function badgeAnchor(link) {
    let anchor = anchors.get(link);
    if (anchor) return anchor;
    anchor = link;
    for (let el = link, i = 0; i < 4 && el.parentElement; i++, el = el.parentElement) {
      const parent = getComputedStyle(el.parentElement);
      const oneLine = parent.display.endsWith('flex')
        ? parent.flexDirection === 'row' &&
          parent.flexWrap === 'nowrap' &&
          /^(normal|flex-start|start|left)$/.test(parent.justifyContent)
        : !getComputedStyle(el).display.startsWith('block');
      if (oneLine) {
        anchor = el;
        break;
      }
    }
    anchors.set(link, anchor);
    return anchor;
  }

  // Returns the badge element (or null) so scan() can remove stale ones.
  // `adultLabel` (a reason) adds an "18+" marker, shown even without post stats.
  function decorateHandleLink(link, handle, adultLabel = null) {
    const found = lookup(handle);
    const show = found && (settings.showAll || found.stats.level !== 'ok');
    const anchor = badgeAnchor(link);
    const next = anchor.nextElementSibling;
    const existing = next?.classList.contains('bm-badge') ? next : null;
    let spec = show && {
      className: `bm-badge bm-${found.stats.level}`,
      text: formatBadge(found.stats.rate),
      title: describe(found.user, found.stats),
    };
    if (adultLabel) {
      spec = {
        className: 'bm-badge bm-adult',
        text: spec ? `18+ · ${spec.text}` : '18+',
        title: `Possible adult content: ${adultLabel}` + (spec ? `\n\n${spec.title}` : ''),
      };
    }
    return syncBadge(existing, (badge) => anchor.after(badge), spec);
  }

  // Profile header: the "@handle" under the display name (plain text, not a link).
  function decorateProfile() {
    const [handle = '', tab, ...rest] = location.pathname.split('/').filter(Boolean);
    const isProfile = HANDLE_RE.test(handle) && rest.length === 0 && (!tab || PROFILE_TABS.has(tab));
    const found = isProfile ? lookup(handle) : null;
    let anchor = null;
    if (found) {
      const target = `@${handle.toLowerCase()}`;
      for (const el of document.querySelectorAll('main span, main div')) {
        if (el.childElementCount === 0 && el.textContent.trim().toLowerCase() === target && !el.closest('article, a')) {
          anchor = el.parentElement;
          break;
        }
      }
    }
    const next = anchor?.nextElementSibling;
    const existing = next?.classList.contains('bm-profile') ? next : null;
    for (const stale of document.querySelectorAll('.bm-profile')) if (stale !== existing) stale.remove();
    if (!anchor) return;
    syncBadge(existing, (badge) => anchor.after(badge), {
      className: `bm-badge bm-profile bm-${found.stats.level}`,
      text:
        `About ${formatPhrase(found.stats.rate)} · ` +
        `${found.user.statuses.toLocaleString('en-US')} posts in ${formatAge(found.stats.ageDays)}`,
      title: describe(found.user, found.stats),
    });
  }

  // Idempotent: only touches the DOM when something actually changed, so our
  // own writes don't keep re-triggering the MutationObserver.
  function syncBadge(badge, insert, spec) {
    if (!spec) {
      badge?.remove();
      return null;
    }
    if (!badge) {
      badge = document.createElement('span');
      // Keep clicks on the badge from opening the post or profile.
      badge.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
      });
      insert(badge);
    }
    if (badge.className !== spec.className) badge.className = spec.className;
    if (badge.textContent !== spec.text) badge.textContent = spec.text;
    if (badge.title !== spec.title) badge.title = spec.title;
    return badge;
  }

  function syncArticle(article, handle, found, adult) {
    const who = handle?.toLowerCase() ?? '';
    let mode = null; // 'collapse' | 'blur'
    let reason = null;
    let text = '';
    let title = '';
    if (adult && (settings.adultAction === 'hide' || settings.adultAction === 'blur') && !revealed.has(`adult:${who}`)) {
      mode = settings.adultAction === 'blur' ? 'blur' : 'collapse';
      reason = 'adult';
      text = `${mode === 'blur' ? 'Blurred' : 'Hidden'}: possible adult content${handle ? ` from @${handle}` : ''}.`;
      title = adult;
    }
    const botAction = found?.stats.level === 'bot' ? settings.botAction : 'label';
    if (!mode && botAction === 'collapse' && !revealed.has(`bot:${who}`)) {
      mode = 'collapse';
      reason = 'bot';
      text = `Hidden post from @${found.user.screenName}, who averages about ${formatPhrase(found.stats.rate)}: likely a bot.`;
      title = describe(found.user, found.stats);
    }

    article.classList.toggle('bm-dim', botAction === 'dim' && mode !== 'collapse');
    article.classList.toggle('bm-collapsed', mode === 'collapse');
    article.classList.toggle('bm-blur', mode === 'blur');

    const prev = article.previousElementSibling;
    let notice = prev?.classList.contains('bm-notice') ? prev : null;
    if (!mode) {
      notice?.remove();
      return;
    }
    if (!notice) {
      notice = document.createElement('div');
      notice.className = 'bm-notice';
      notice.append(document.createElement('span'));
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = 'Show';
      button.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        revealed.add(notice.dataset.key);
        scheduleScan();
      });
      notice.append(button);
      article.parentElement.insertBefore(notice, article);
    }
    const label = notice.firstElementChild;
    if (label.textContent !== text) label.textContent = text;
    if (notice.title !== title) notice.title = title;
    notice.dataset.key = `${reason}:${who}`;
  }

  new MutationObserver(scheduleScan).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
})();
