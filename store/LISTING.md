# Chrome Web Store submission: Bot Meter for X: Twitter Bot Detector

Upload: `dist/bot-meter-x-<version>.zip` (build with `npm run build`).
Images: `store/images/` (re-render with `npm run store:images`).

## Store listing tab

**Name** (set in `manifest.json` "name", max 75 chars; the strongest search signal):
`Bot Meter for X: Twitter Bot Detector` (37 chars)

**Summary** (set in `manifest.json` "description", max 132 chars; shown under the name in search results):
`Twitter bot detector for X: see how many posts per day every account makes, right in your feed. Spot, dim or hide spam bots.` (124 chars)

**Category:** Social Networking. It's the category people browse for X/Twitter tools, and it has
less competition than "Privacy & Security" or "Tools".

**Language:** English

**Description** (keywords worked in naturally: Twitter bot detector, X bot checker, spam bots, fake
accounts, tweets per day, automated accounts, reply bots. The store penalises keyword lists, so
none are stuffed):

```
Bot Meter is a free Twitter bot detector for X that shows how many posts per day every account makes, right next to its name in your feed. Spot spam bots, fake accounts and automated reply bots at a glance, without leaving your timeline.

HOW IT WORKS
Bot Meter divides an account's total posts by its age. A real person usually posts a handful of times a day. An account that has averaged 300 tweets per day since it was created is almost certainly automated. That one number cuts through crypto spam, engagement farms and reply-bot swarms faster than any profile check.

FEATURES
• Posts-per-day badge next to every author: home timeline, replies, quoted posts, search results and profiles
• Color-coded at a glance: grey for normal, amber for a high posting rate (50+ per day), red for likely bots (150+ per day)
• Adjustable thresholds, so you decide what counts as a bot
• Hover a badge to see total posts, account age, join date, followers and following
• Profile badge, e.g. "≈ 66 posts/day · 109,671 posts in 4.5 years"
• Deal with bot posts your way: label them, dim them, or collapse them behind a "Show" button
• Quiet mode: only badge high-frequency accounts
• Works in reply threads, where bot replies pile up the most

PRIVATE AND LIGHTWEIGHT
• No login, no X API key, no account connection
• No extra network requests: it reads the account data X has already loaded in your browser
• Nothing is collected, tracked or sent anywhere. Only your settings are saved
• Open source

WHO IT'S FOR
Anyone tired of bot replies, spam accounts and fake engagement on X. Useful for checking whether a viral post's replies are real people, before you reply to or follow an account, and for journalists and researchers doing quick account checks.

GOOD TO KNOW
X counts replies and reposts as posts, so some very active real people, such as news outlets, live-tweeters and heavy repliers, can reach 50 to 100 posts a day. Treat the badge as a strong signal, not proof.

Account age comes from the account's ID: exact for accounts created since 2016, and estimated to within a few months for older accounts (marked with "≈").

Works on x.com (twitter.com links redirect there) in Chrome, Brave and other Chromium browsers.

Not affiliated with or endorsed by X Corp. "X" and "Twitter" are trademarks of X Corp., used here only to describe compatibility.

Made by @buildwithSud. If Bot Meter saves you from a few bots, you can buy me a coffee: buymeacoffee.com/sudarshanhosalli
```

**Screenshots (1280×800):**
1. `store/images/screenshot-1-feed.png`
2. `store/images/screenshot-2-settings.png`

**Small promo tile (440×280):** `store/images/promo-small-440x280.png`

**Store icon (128×128):** `icons/icon128.png`

**Homepage URL:** https://sudarshan161219.github.io/Bot-Meter-for-X/
**Support URL:** https://github.com/sudarshan161219/Bot-Meter-for-X/issues

## Privacy practices tab

**Single purpose description:**
```
Bot Meter has one purpose: on x.com, it shows each account's average number of posts per day (total posts divided by account age) as a small badge next to the account's name, so users can spot likely automated (bot) accounts. An optional setting lets users dim or collapse posts from accounts above a posts-per-day threshold they choose.
```

**Permission justification: `storage`**
```
Used only to save the user's own settings: whether the extension is on, the two posts-per-day thresholds ("high rate" and "likely bot"), whether to show a badge on every account, and what to do with posts from likely bots (label, dim or collapse). Settings are saved with chrome.storage.sync so they persist between sessions. No browsing history, account data or post content is stored.
```

**Host permission justification** (content scripts on `https://x.com/*` only):
```
The extension's content scripts run only on https://x.com/*, the single site it is built for. There they read account data that X has already loaded into the page (each account's post count and numeric account ID), calculate posts per day locally in the browser, and add a badge next to each account name. This has to happen automatically as the feed loads and scrolls, so on-click access (activeTab) would not work. The extension runs on no other site, makes no network requests of its own, and sends no data anywhere.
```

**Are you using remote code?** No, I am not using remote code.
```
All JavaScript is packaged with the extension. Nothing is loaded from a server, and no eval or remote scripts are used.
```

**Data usage.** Tick **none** of the data categories:

| Category | Tick? | Why |
|---|---|---|
| Personally identifiable information | No | Never read or stored |
| Health information | No | Never read |
| Financial and payment information | No | Never read |
| Authentication information | No | No login; X session is never touched |
| Personal communications | No | DMs and emails are never read |
| Location | No | Never read |
| Web history | No | Nothing about browsing is recorded |
| User activity | No | No clicks, keystrokes or scrolling are tracked |
| Website content | No | Post counts and account IDs are read on the page but processed only in the browser; nothing is stored or transmitted |

Then tick all three certifications:
- I do not sell or transfer user data to third parties, outside of the approved use cases
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- I do not use or transfer user data to determine creditworthiness or for lending purposes

**Privacy policy URL:** `https://sudarshan161219.github.io/Bot-Meter-for-X/privacy.html`
(the `docs/` site; see "Hosting the website" in the README).

## Distribution tab

Visibility: Public. Regions: all.
