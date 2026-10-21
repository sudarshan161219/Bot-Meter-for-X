// Shared by the content script and the popup.
globalThis.BOT_METER_DEFAULTS = {
  enabled: true,
  // Show a badge on every account, or only on accounts at/above the warn rate.
  showAll: true,
  // Posts per day. Note X's post count includes replies and reposts.
  warnRate: 50,
  botRate: 150,
  // What to do with posts from accounts at/above botRate: 'label' | 'dim' | 'collapse'.
  botAction: 'dim',
  // Which kinds of posts get checked. Off: no badge, never dimmed or collapsed.
  onReplies: true,
  onReposts: true,
  onQuotes: true,
  // Posts X flags as sensitive (or from accounts it flags): 'off' | 'label' | 'blur' | 'hide'.
  adultAction: 'hide',
  // Also treat posts as adult when their text or author name has words like NSFW, 18+, OnlyFans.
  adultWords: true,
  // Declutter: remove these from the page entirely.
  hidePromoted: true,
  hideWhoToFollow: true,
  hideTrends: true,
  hidePremium: true,
  hideLive: true,
  // On a post's page, add a link to its quotes (X hides it on some posts).
  showQuotes: true,
  // Creator Tools > Reply Filter (on status pages). Mode: 'badge' | 'collapse' | 'hide'.
  replyFilter: true,
  replyFilterMode: 'badge',
  // 'lenient' | 'balanced' | 'strict'
  replyFilterSensitivity: 'balanced',
  // Comma- or line-separated: handles never filtered, and words that always filter a reply.
  replyFilterAllow: '',
  replyFilterMuted: '',
};
