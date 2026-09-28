// Isolated-world content script: receives user stats from inject.js and
// decorates the X page with posts/day badges.
(() => {
  const SOURCE = 'bot-meter-x';
  const DEFAULTS = globalThis.BOT_METER_DEFAULTS;
  const { computeStats, formatBadge, formatPhrase, formatAge, describe } = globalThis.BotMeterStats;
  const HANDLE_RE = /^[A-Za-z0-9_]{1,15}$/;
  const PROFILE_TABS = new Set(['with_replies', 'media', 'reposts', 'highlights', 'articles', 'likes', 'superfollows', 'affiliates']);

  const users = new Map(); // lowercased handle -> user record from inject.js
  const revealed = new Set(); // handles the viewer chose to show despite "collapse"
  // Post kinds, keyed by the post ID that appears in the page's /status/<id> links.
  const replies = new Set(); // IDs of replies
  const reposts = new Set(); // IDs of posts that showed up as someone's repost
  const quotedAuthorOf = new Map(); // quoting post ID -> lowercased author of the quoted post
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
      if (!prev || prev.statuses !== merged.statuses || prev.createdAt !== merged.createdAt || prev.followers !== merged.followers) {
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
      if (typeof p.quotedAuthor === 'string' && !quotedAuthorOf.has(p.id)) {
        quotedAuthorOf.set(p.id, p.quotedAuthor.toLowerCase());
        changed = true;
      }
    }
    if (changed) scheduleScan();
  });

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
      const checked = isChecked(postKind(article, id, focalId));
      const quotedAuthor = id ? quotedAuthorOf.get(id) : undefined;
      links.forEach(({ link, handle }, i) => {
        handled.add(link);
        // Later author links in a post are usually the quoted post's author.
        const on = i > 0 && handle.toLowerCase() === quotedAuthor ? settings.onQuotes : checked;
        decorated.add(decorateHandleLink(link, on ? handle : null));
      });
      // Only the post's own author decides dimming/collapsing.
      syncArticle(article, author, checked ? lookup(author) : null);
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

    decorateProfile();
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

  function isChecked(kind) {
    if (kind === 'reply') return settings.onReplies;
    if (kind === 'repost') return settings.onReposts;
    if (kind === 'quote') return settings.onQuotes;
    return true;
  }

  function lookup(handle) {
    if (!settings.enabled || !handle) return null;
    const user = users.get(handle.toLowerCase());
    if (!user) return null;
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
  function decorateHandleLink(link, handle) {
    const found = lookup(handle);
    const show = found && (settings.showAll || found.stats.level !== 'ok');
    const anchor = badgeAnchor(link);
    const next = anchor.nextElementSibling;
    const existing = next?.classList.contains('bm-badge') ? next : null;
    return syncBadge(
      existing,
      (badge) => anchor.after(badge),
      show && {
        className: `bm-badge bm-${found.stats.level}`,
        text: formatBadge(found.stats.rate),
        title: describe(found.user, found.stats),
      }
    );
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

  function syncArticle(article, handle, found) {
    const flagged = found?.stats.level === 'bot';
    const action = flagged ? settings.botAction : 'label';
    const collapse = action === 'collapse' && !revealed.has(handle?.toLowerCase());

    article.classList.toggle('bm-dim', action === 'dim');
    article.classList.toggle('bm-collapsed', collapse);

    const prev = article.previousElementSibling;
    let notice = prev?.classList.contains('bm-notice') ? prev : null;
    if (!collapse) {
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
        revealed.add(notice.dataset.handle);
        scheduleScan();
      });
      notice.append(button);
      article.parentElement.insertBefore(notice, article);
    }
    const text = `Hidden post from @${found.user.screenName}, who averages about ${formatPhrase(found.stats.rate)}: likely a bot.`;
    const label = notice.firstElementChild;
    if (label.textContent !== text) label.textContent = text;
    if (notice.title !== describe(found.user, found.stats)) notice.title = describe(found.user, found.stats);
    notice.dataset.handle = handle.toLowerCase();
  }

  new MutationObserver(scheduleScan).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
})();
