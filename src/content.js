// Isolated-world content script: receives user stats from inject.js and
// decorates the X page with posts/day badges.
(() => {
  const SOURCE = 'bot-meter-x';
  const DEFAULTS = globalThis.BOT_METER_DEFAULTS;
  const { computeStats, formatRate, formatAge, describe } = globalThis.BotMeterStats;
  const HANDLE_RE = /^[A-Za-z0-9_]{1,15}$/;
  const PROFILE_TABS = new Set(['with_replies', 'media', 'reposts', 'highlights', 'articles', 'likes', 'superfollows', 'affiliates']);

  const users = new Map(); // lowercased handle -> user record from inject.js
  const revealed = new Set(); // handles the viewer chose to show despite "collapse"
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
    // Every author "@handle" link: posts, quoted posts, replies, user lists, hover cards.
    const decorated = new Set();
    for (const link of document.querySelectorAll('a[href^="/"]')) {
      const handle = authorHandle(link);
      if (!handle) continue;
      decorated.add(decorateHandleLink(link, handle));
    }
    // Drop badges whose link X re-rendered or removed.
    for (const badge of document.querySelectorAll('.bm-badge:not(.bm-profile)')) {
      if (!decorated.has(badge)) badge.remove();
    }

    // Dim/collapse posts by their own author (first author link in the post).
    for (const article of document.querySelectorAll('article')) {
      let handle = null;
      for (const link of article.querySelectorAll('a[href^="/"]')) {
        if (link.closest('article') !== article) continue;
        handle = authorHandle(link);
        if (handle) break;
      }
      syncArticle(article, handle, lookup(handle));
    }

    decorateProfile();
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

  // Returns the badge element (or null) so scan() can remove stale ones.
  function decorateHandleLink(link, handle) {
    const found = lookup(handle);
    const show = found && (settings.showAll || found.stats.level !== 'ok');
    const next = link.nextElementSibling;
    const existing = next?.classList.contains('bm-badge') ? next : null;
    return syncBadge(
      existing,
      (badge) => link.after(badge),
      show && {
        className: `bm-badge bm-${found.stats.level}`,
        text: `${formatRate(found.stats.rate)}/day`,
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
        `≈ ${formatRate(found.stats.rate)} posts/day · ` +
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
    const text = `Hidden post from @${found.user.screenName}: ≈ ${formatRate(found.stats.rate)} posts/day, likely a bot.`;
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
