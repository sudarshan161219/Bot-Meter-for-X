// Bot Meter's service worker. Its only job: tell Chrome which page to open when
// someone uninstalls Bot Meter (a short, optional "why did you leave?" form on the
// Bot Meter website). The version number rides along so feedback can be matched
// to a release. Nothing else is sent, and it needs no permission.
const UNINSTALL_PAGE = 'https://sudarshan161219.github.io/Bot-Meter-for-X/uninstall.html';

chrome.runtime.setUninstallURL(`${UNINSTALL_PAGE}?v=${encodeURIComponent(chrome.runtime.getManifest().version)}`);
