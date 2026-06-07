// ── autoshare.js — daily "top track" suggestion (asks before sharing) ──
// Instead of auto-posting, this prepares a suggestion each day. The user
// then confirms it (and picks the audience + caption) in the app.
import db from './db.js';
import { spotifyGet, normalizeTrack } from './spotify.js';

const today = () => new Date().toISOString().slice(0, 10);

// Prepare today's suggestion for one user (does NOT post).
export async function prepareSuggestionForUser(user) {
  const day = today();
  // already handled (posted or dismissed) or already suggested today? skip.
  if (user.last_auto_date === day || user.pending_date === day) return { skipped: 'already' };

  const data = await spotifyGet(user, '/me/top/tracks?limit=1&time_range=short_term');
  const item = data?.items?.[0];
  if (!item) return { skipped: 'no_top_track' };
  const track = normalizeTrack(item);

  db.prepare('UPDATE users SET pending_track=?, pending_date=? WHERE id=?')
    .run(JSON.stringify(track), day, user.id);
  return { pending: track };
}

export async function runSuggestionsForAll() {
  const users = db.prepare('SELECT * FROM users WHERE auto_share=1').all();
  for (const u of users) {
    try { await prepareSuggestionForUser(u); }
    catch (e) { console.error(`  auto-share suggestion failed for @${u.handle}: ${e.message}`); }
  }
}

// Check hourly; the once-per-day guard means each enabled user is suggested at most once daily.
export function startAutoShareScheduler() {
  const tick = () => runSuggestionsForAll().catch(e => console.error('auto-share tick error:', e.message));
  setTimeout(tick, 15000);                 // first pass shortly after boot
  setInterval(tick, 60 * 60 * 1000);       // then hourly
}
