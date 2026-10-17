// Entry for bookmarks.html (Bookmark Brain).
import { startApp } from '../bookmark-brain/app';

startApp().catch((error: unknown) => {
  console.warn('[BotMeter:Creator]', error);
  const summary = document.getElementById('summary');
  if (summary) summary.textContent = 'Bookmark Brain could not open its data. Reload the page to try again.';
});
