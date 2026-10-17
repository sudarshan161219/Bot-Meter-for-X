# Chrome Web Store submission: Creator Tools for X

Upload: `dist/creator-tools-x-<version>.zip` (build with `npm run build:tools`).
Icon: `creator-tools/icons/icon128.png` (source: `store/creator-tools-icon.svg`; re-render with
`npm run store:images`). Screenshots (1280×800) and a small promo tile (440×280) still need to be made.

## Store listing tab

**Name** (manifest "name", max 75 chars): `Creator Tools for X` (19 chars). A longer, more searchable
option if wanted: `Creator Tools for X: Thread Exporter & Bookmark Manager` (55 chars).

**Summary** (manifest "description", max 132 chars):
`Export X (Twitter) threads as Markdown, carousels or PDF. Search, tag and export your X bookmarks. All stays on your device.` (124 chars)

**Category:** Social Networking (where people browse for X/Twitter tools). "Productivity" also fits.

**Language:** English

**Description:**

```
Creator Tools for X turns threads into reusable content and your X bookmarks into a searchable library, right in your browser. No account, no server, no X API key.

THREAD EXPORTER
Open any thread on X and click Export on its first post:
• Markdown with title, author, date and source link, ready for Notion, Obsidian or your blog
• Image carousel: 1080×1350 slides sized for Instagram and LinkedIn, downloaded as a zip, in light, dark or your brand color
• PDF: a clean reading layout with selectable text, images and links
• Copy text: the whole thread, numbered, on your clipboard
A live preview shows exactly what you'll get, and updates as more of the thread loads.

BOOKMARK BRAIN
Visit your bookmarks on X and they're saved as they load. "Sync all" scrolls slowly through the whole list for you, and you can stop it any time. Then open Bookmark Brain from the toolbar:
• Instant search across post text, authors, links, tags and notes
• Filters: author, date range, has media, has links, minimum likes
• Sort by date bookmarked, date posted or engagement
• Your own tags and notes, with suggested tags from keyword rules you control
• Export to JSON, CSV or Markdown grouped by tag, and import on another computer

PRIVATE BY DESIGN
• Reads only what X has already loaded in your browser; makes no requests to X's API
• Saved bookmarks stay on your device, in the extension's own storage
• Nothing is sent to the developer or anyone else. No analytics, no tracking
• It never posts, likes, follows or does anything on your account
• Open source

Works on x.com (twitter.com links redirect there) in Chrome, Brave and other Chromium browsers. For a posts-per-day bot badge and a reply filter, see the companion extension, Bot Meter for X.

Not affiliated with or endorsed by X Corp. "X" and "Twitter" are trademarks of X Corp., used here only to describe compatibility.

Made by @buildwithSud.
```

**Homepage URL:** https://sudarshan161219.github.io/Bot-Meter-for-X/
**Support URL:** https://github.com/sudarshan161219/Bot-Meter-for-X/issues

## Privacy practices tab

**Single purpose description:**
```
Creator Tools for X helps people reuse content they've already loaded on X (x.com): it exports a thread the user is viewing (Markdown, image carousel, PDF or plain text), and saves the user's own X bookmarks, as they load on x.com/i/bookmarks, into a local library they can search, tag, annotate and export. Everything happens on x.com and on the user's device, using data X has already loaded into the page.
```

**Permission justification: `storage`**
```
Used to save the user's two on/off settings (Thread Exporter, Bookmark Brain) with chrome.storage.sync, their last export format and theme with chrome.storage.local, and, for a moment, the thread being exported to PDF in chrome.storage.session so the extension's print page can show it. Saved bookmarks are kept in the extension's own IndexedDB on the user's device. Nothing is transmitted.
```

**Host permission justification** (content scripts on `https://x.com/*` only):
```
The content scripts run only on https://x.com/*. There they read posts X has already loaded into the page, to add an Export button to threads and, on the user's bookmarks page, to save the bookmarks that load. Both need to see the page as it loads and scrolls, so on-click access (activeTab) would not work. The extension runs on no other site, makes no requests to X's API, and sends no data anywhere.
```

**Are you using remote code?** No, I am not using remote code.
```
All JavaScript, including the Dexie and MiniSearch libraries, is bundled with the extension. Nothing is loaded from a server, and no eval or remote scripts are used.
```

**Data usage.** Bookmark Brain keeps post content on the device, so disclose it even though it's
never transmitted:

| Category | Tick? | Why |
|---|---|---|
| Website content | Yes | Bookmarked posts (text, author, links, media addresses, counts) are saved locally in the browser so the user can search them; never transmitted |
| Personally identifiable information | No | Never read or stored |
| Health, financial, authentication, personal communications, location | No | Never read |
| Web history | No | No record of pages visited is kept |
| User activity | No | No clicks, keystrokes or scrolling are tracked |

Tick all three certifications (no selling or transferring data; no unrelated use; no creditworthiness use).

**Privacy policy URL:** `https://sudarshan161219.github.io/Bot-Meter-for-X/creator-tools-privacy.html`

## Distribution tab

Visibility: Public. Regions: all.
