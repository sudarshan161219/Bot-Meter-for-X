# Manual test checklist

Automated tests (`npm test`) cover the parsers, rules, formats and storage. These checks cover what
only a real x.com session can show. Before each release, build (`npm run build:creator`), reload both
unpacked extensions in `chrome://extensions`, and refresh x.com.

## Shared capture (both extensions)

- [ ] DevTools console on x.com shows `[BotMeter:Creator] loaded; waiting for posts…` and then
      `capturing posts…`, with no red errors from either extension.
- [ ] In the "Bot Meter for X" console context, `botMeterCreator.cache.tweets.size` grows as you scroll.
- [ ] In the "Creator Tools for X" context, `creatorTools.cache.tweets.size` grows too.
- [ ] Bot Meter badges still appear everywhere with Creator Tools installed alongside.

## Reply Filter (Bot Meter → popup → Creator Tools)

- [ ] On a busy post's page, tags such as "low effort", "promotion", "copy-pasted" and "likely bot"
      appear after the @handle (after Bot Meter's own badge); hovering shows the reasons.
- [ ] "Reply Filter: Flagged N of M replies" sits under the post; M grows as you scroll.
- [ ] Collapse: filtered replies become one-line notices; Show reveals one; Show all / Filter again
      toggle the rest.
- [ ] Hide completely: filtered replies disappear with no notice.
- [ ] Lenient flags fewer replies than Strict; muted keywords always filter; never-filter handles
      and the post's own author are never flagged.
- [ ] The home feed and profiles are unchanged; switching the Reply Filter off removes everything it added.

## Quote count (Bot Meter → popup → Feed)

- [ ] On a quoted post's page, a "View N quotes" pill ends the action bar; it opens the post's quotes list.
- [ ] Without a count it reads "View quotes"; the Feed tab's switch removes it.

## Popup (Bot Meter)

- [ ] The three tabs (Bots, Replies, Feed) fit without scrolling, in light and dark mode.
- [ ] Every switch, segmented button, slider and list saves and still applies after reopening the popup.
- [ ] The header switch fades the settings and turns Bot Meter off on the page.

## Thread Exporter (Creator Tools)

- [ ] On the first post of a thread (an author replying to themselves), an Export pill appears in the
      action bar; it doesn't appear on single posts.
- [ ] The modal shows "N posts by @handle captured", and N rises if you scroll the page behind it.
- [ ] Markdown downloads `handle-id.md`: frontmatter, one paragraph per post, images as links, quoted
      posts as blockquotes.
- [ ] Image carousel downloads a zip of 1080×1350 PNGs; light, dark and brand themes all render; the
      avatar shows (or an initial if X's image server refuses).
- [ ] PDF opens a new tab with the print dialog; "Save as PDF" keeps text, links and images.
- [ ] Copy text puts the numbered thread on the clipboard.
- [ ] Escape, ×, Close and clicking outside all close the modal.
- [ ] The popup's Thread Exporter switch removes and restores the Export pill.

## Bookmark Brain (Creator Tools)

- [ ] On your bookmarks page (x.com/i/bookmarks, which X now redirects to x.com/i/history), the bottom bar shows the saved count, and it rises while scrolling.
- [ ] Sync all scrolls every 1.5–3 s, shows progress, stops at the end of the list, and Stop works.
- [ ] Open (or the popup's button) opens Bookmark Brain with the bookmarks newest first.
- [ ] Search finds by text, author, link, tag and note; filters and sorts work together.
- [ ] Adding, removing and accepting suggested tags, and notes, survive a reload.
- [ ] Tag rules: editing changes the suggestions; Restore defaults works.
- [ ] Export JSON / CSV / Markdown download; CSV opens correctly in a spreadsheet.
- [ ] Delete all data empties the library; importing the JSON export brings it back.
- [ ] The popup's Bookmark Brain switch stops saving and removes the bar on the bookmarks page.
