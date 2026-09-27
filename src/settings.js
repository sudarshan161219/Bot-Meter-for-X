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
};
