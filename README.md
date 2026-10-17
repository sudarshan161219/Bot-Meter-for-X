# Bot Meter for X: Twitter Bot Detector

A Chrome extension that shows how often each X (Twitter) account posts, right in your feed:

**posts per day = total posts ÷ account age**

An account that has averaged 200 posts a day for years is very likely automated.

- A badge next to every author name in timelines, threads, search, and quoted posts, e.g. `66/day`.
  It's an average in whole numbers; quiet accounts show per week or month (`2/week`, `3/month`)
  - grey: normal
  - amber: high rate (default ≥ 50/day)
  - red: likely bot (default ≥ 150/day)
- A larger badge on profile pages: `About 66 posts a day · 109,671 posts in 4.5 years`
- Hover any badge for details. The second line sums the account up, e.g.
  `Premium · 35/day · 2 handle changes (last Mar 2025)`, then total posts, account age, join date,
  followers/following. Handle changes and country come from X's "About this account" panel, so
  they appear for accounts whose panel you've opened (no extra requests are made to fetch them).
- Posts from likely bots can be **labelled**, **dimmed** (the default), or **collapsed** behind a "Show" button.
- Choose which posts get checked: replies, reposts and quoted posts can each be switched off.
- Adult content filter: posts X flags as sensitive (on the post, its media, or the account) can be
  labelled `18+`, blurred, or hidden (the default). Optionally also matches adult-spam words
  (NSFW, 18+, OnlyFans, 🔞) in post text and display names.
- Hide clutter: promoted posts (ads), "Who to follow", "What's happening", "Subscribe to Premium"
  and "Live on X", in the feed and sidebar, each with its own switch. Ads are found by X's
  `promoted_metadata`; boxes by their heading, read from X's data or X's own translations, so it
  works in any language. The whole card goes, including its border.
- **Reply Filter** (popup → Creator Tools): on a post's page, flags low-effort and bot replies:
  stock replies ("great post", "this", 🔥🔥), text copy-pasted by several accounts, Telegram and
  crypto promotion, "follow back" bait, and accounts Bot Meter rates as likely bots. Show a badge
  (the default), collapse them behind "Show", or hide them, with a lenient/balanced/strict slider,
  a never-filter list and muted keywords. The post's own author and people you follow are never
  filtered. A line under the post counts them: "Filtered 23 of 140 replies".
- Thresholds and behavior are configurable from the toolbar popup.

## Install

From the Chrome Web Store (link coming once the listing is approved), or in developer mode:

1. Run `npm install` then `npm run build:creator` (builds `src/gen/`, which the manifest loads)
2. Open `chrome://extensions`
3. Turn on **Developer mode** (top right)
4. Click **Load unpacked** and select this folder
5. Open or reload x.com

Works in Chrome, Brave and other Chromium browsers (Chrome 111+).

## How it works

X's web app already has each account's post count on the page for every post it shows. The
extension doesn't make any requests of its own and needs no API key:

- `src/inject.js` runs in the page before X's code and reads the data X already receives:
  - **first page load:** X server-renders and streams its data into inline scripts that write
    into `self.$R.tsr`; the extension traps that array and reads each object as it lands.
  - **after that** (scrolling, navigating): responses from `api.x.com/graphql/...` are read as they
    arrive by wrapping `fetch`/`XMLHttpRequest`.
- **Join date:** X doesn't send join dates with posts (only on profile pages), so the account age
  comes from the account's numeric ID. IDs since ~April 2016 are Snowflake IDs with the creation
  time built in (exact). Older, sequential IDs are interpolated between ~90 known accounts
  (accurate to within a few months); the tooltip marks those dates with "≈".
- `src/content.js` receives the stats via `postMessage`, finds each author's `@handle` link on the
  page (skipping @mentions inside post text), and adds the badges.

Nothing is stored or sent anywhere. Only your settings are saved, in `chrome.storage.sync`.

## Caveats

- X's post count **includes replies and reposts**, so very active humans (reply-guys, news
  aggregators, live-tweeters) can legitimately hit 50–100/day. Treat the badge as a signal, not a verdict.
- X rewrote its web app in 2026 (the "x-web" client: no more `data-testid` attributes, new API field
  names). This version targets that client. If X changes it again, the field names in
  `src/inject.js` and the `@handle` link matching in `src/content.js` are what to update.

## Creator Tools for X (separate extension)

`creator-tools/` is a second extension built from the same code. It's separate because the
Chrome Web Store asks each extension to have a single purpose. It reads only the posts X's page
has already loaded, makes no requests of its own, and needs only the `storage` permission.

- **Thread Exporter:** on a post page that's part of a thread (the author replying to
  themselves), an **Export** button on the first post's action bar opens a preview:
  - **Markdown:** frontmatter (title, author, date, source), one paragraph per post, images as
    links, quoted posts as blockquotes.
  - **Image carousel:** 1080×1350 PNG slides in a .zip, posts fitted to slides by length,
    light, dark or brand-color themes.
  - **PDF:** a clean reading layout in a new tab with the print dialog; choose "Save as PDF".
  - **Copy text:** the unrolled thread, numbered, to the clipboard.

To try it: `npm run build:creator`, then **Load unpacked** and pick the `creator-tools/` folder.
`npm run build:tools` makes the store zip in `dist/`.

## Development

Bot Meter's core (`src/*.js`) is plain JavaScript with no build step. Creator Tools live in
`src/creator/` (strict TypeScript), bundled by Vite into `src/gen/` (git-ignored):

- `src/gen/creator-main.js` runs in the page just before `inject.js` and registers the parser that
  turns every response `inject.js` sees into normalized posts (`src/creator/types.ts`).
- `src/gen/creator-content.js` runs after `content.js`, keeps the shared post cache, and reuses the
  core's page scan and helpers through `globalThis.BotMeterCore`.
- `creator-tools/gen/` holds the Creator Tools extension's bundles: its own page hook
  (`src/creator/capture/hook.ts`, a typed copy of `inject.js`'s), content script, service worker
  and print page. Thread assembly, the export formats, slide layout and the zip writer in
  `src/creator/thread-exporter/` are pure and unit-tested.
- The Reply Filter's heuristics are pure functions in `src/creator/reply-filter/rules.ts`; its
  settings sit with the core's in `src/settings.js`, and paid-feature checks in
  `src/creator/entitlements.ts`.

```
npm run build:creator                 # build src/gen/ (needed before loading unpacked)
npm run typecheck                     # strict TypeScript check of src/creator and its tests
npm test                              # builds, then core tests (node:test) + Creator tests (Vitest)
python3 -m http.server 8765           # then open http://127.0.0.1:8765/test/harness.html
```

`test/pages/` holds real server-rendered x.com pages; `test/ssr.test.js` replays their inline
scripts through `inject.js`. `test/anchors.json` is the ID → join-date data behind the estimates.

`test/harness.html` loads the real extension scripts against a mock X page, so you can check the
badge, dim and collapse behavior without logging in to X.

## Hosting the website

`docs/` holds the landing page (`index.html`) and privacy policy (`privacy.html`), served by GitHub
Pages:

1. Push the repo to GitHub (the repo must be public for Pages on a free account).
2. **Settings → Pages → Build and deployment**: Source "Deploy from a branch", branch `main`,
   folder `/docs`.
3. The site goes live at https://sudarshan161219.github.io/Bot-Meter-for-X/ and the privacy policy
   at https://sudarshan161219.github.io/Bot-Meter-for-X/privacy.html (the URL to give the Chrome
   Web Store).

Once the store listing is approved, point the "Get Bot Meter" button in `docs/index.html` at it.
