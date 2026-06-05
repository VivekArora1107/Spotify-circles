// ── autoshare.js — daily "share my #1 top track to Public" job ────
// Uses each user's stored Spotify token, so it runs even with no browser open.
import crypto from 'crypto';
import db from './db.js';
import { spotifyGet, normalizeTrack } from './spotify.js';

const uid = () => crypto.randomBytes(9).toString('base64url');
const today = () => new Date().toISOString().slice(0, 10);

// Run for a single user. force=true ignores the once-per-day guard (for the "share now" button).
export async function runAutoShareForUser(user, { force = false } = {}) {
  const day = today();
  if (!force && user.last_auto_date === day) return { skipped: 'already_today' };

  const data = await spotifyGet(user, '/me/top/tracks?limit=1&time_range=short_term');
  const item = data?.items?.[0];
  if (!item) return { skipped: 'no_top_track' };
  const track = normalizeTrack(item);

  // avoid spamming the identical song two auto-posts in a row (unless forced)
  if (!force && user.last_auto_track === track.id) {
    db.prepare('UPDATE users SET last_auto_date=? WHERE id=?').run(day, user.id);
    return { skipped: 'same_track', track };
  }

  const id = uid();
  db.prepare(`INSERT INTO posts (id, user_id, circle_id, track_id, track_title, track_artist, track_album, track_art, track_url, caption, created_at)
              VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, user.id, null, track.id, track.title, track.artist, track.album || '', track.art || '', track.url || '',
         '🎧 My top track right now', Date.now());
  db.prepare('UPDATE users SET last_auto_date=?, last_auto_track=? WHERE id=?').run(day, track.id, user.id);
  return { posted: track };
}

export async function runAutoShareAll() {
  const users = db.prepare('SELECT * FROM users WHERE auto_share=1').all();
  for (const u of users) {
    try { await runAutoShareForUser(u); }
    catch (e) { console.error(`  auto-share failed for @${u.handle}: ${e.message}`); }
  }
}

// Check hourly; the once-per-day guard means each enabled user posts at most once daily.
export function startAutoShareScheduler() {
  const tick = () => runAutoShareAll().catch(e => console.error('auto-share tick error:', e.message));
  setTimeout(tick, 15000);                 // first pass shortly after boot
  setInterval(tick, 60 * 60 * 1000);       // then hourly
}
