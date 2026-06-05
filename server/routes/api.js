// ── routes/api.js — Plane B social API + Plane A data proxy ───────
import { Router } from 'express';
import crypto from 'crypto';
import db from '../db.js';
import { spotifyGet, spotifyPut, validToken, normalizeTrack, normalizeArtist } from '../spotify.js';
import { runAutoShareForUser } from '../autoshare.js';

const router = Router();
const uid = () => crypto.randomBytes(9).toString('base64url');
const now = () => Date.now();

// require login
router.use((req, res, next) => {
  if (!req.session?.userId) return res.status(401).json({ error: 'not_authenticated' });
  req.user = db.prepare('SELECT * FROM users WHERE id=?').get(req.session.userId);
  if (!req.user) { req.session = null; return res.status(401).json({ error: 'not_authenticated' }); }
  next();
});

const publicUser = u => u && ({ id: u.id, name: u.display_name, handle: u.handle, avatar: u.avatar_url, color: u.avatar_color, bio: u.bio });

// ── current user ──────────────────────────────────────────────────
router.get('/me', (req, res) => {
  const u = req.user;
  const circles = db.prepare('SELECT COUNT(*) c FROM circle_members WHERE user_id=?').get(u.id).c;
  const following = db.prepare('SELECT COUNT(*) c FROM follows WHERE follower_id=?').get(u.id).c;
  const shares = db.prepare('SELECT COUNT(*) c FROM posts WHERE user_id=?').get(u.id).c;
  res.json({ ...publicUser(u), autoShare: !!u.auto_share, stats: { circles, following, shares } });
});

router.patch('/me', (req, res) => {
  const { bio, autoShare } = req.body;
  if (typeof bio === 'string') db.prepare('UPDATE users SET bio=? WHERE id=?').run(bio.slice(0, 240), req.user.id);
  if (typeof autoShare === 'boolean') db.prepare('UPDATE users SET auto_share=? WHERE id=?').run(autoShare ? 1 : 0, req.user.id);
  res.json({ ok: true });
});

// Manually trigger the daily auto-share now (the "Share today's top track" button).
router.post('/auto-share/run', async (req, res) => {
  try {
    const result = await runAutoShareForUser(req.user, { force: true });
    res.json(result);
  } catch (e) { res.status(502).json({ error: 'spotify_error', detail: String(e.message) }); }
});

// ── helper: hydrate a post row with author, reactions, replies ────
function hydrate(post, meId) {
  const author = publicUser(db.prepare('SELECT * FROM users WHERE id=?').get(post.user_id));
  const reactionRows = db.prepare('SELECT emoji, user_id FROM reactions WHERE post_id=?').all(post.id);
  const reactions = {};
  let myReaction = null;
  for (const r of reactionRows) {
    (reactions[r.emoji] ||= []).push(r.user_id);
    if (r.user_id === meId) myReaction = r.emoji;
  }
  const replies = db.prepare('SELECT * FROM replies WHERE post_id=? ORDER BY created_at').all(post.id)
    .map(r => ({ id: r.id, text: r.text, created_at: r.created_at, user: publicUser(db.prepare('SELECT * FROM users WHERE id=?').get(r.user_id)) }));
  const circle = post.circle_id && post.circle_id !== 'public'
    ? db.prepare('SELECT id, name, emoji FROM circles WHERE id=?').get(post.circle_id)
    : { id: 'public', name: 'Public', emoji: '🌐' };
  return {
    id: post.id, author, circle, caption: post.caption, created_at: post.created_at,
    track: { id: post.track_id, title: post.track_title, artist: post.track_artist, album: post.track_album, art: post.track_art, url: post.track_url },
    reactions, myReaction, replies
  };
}

// ── feed ──────────────────────────────────────────────────────────
// circle = all | public | <circleId>
router.get('/feed', (req, res) => {
  const me = req.user.id;
  const scope = req.query.circle || 'all';
  const myCircles = db.prepare('SELECT circle_id FROM circle_members WHERE user_id=?').all(me).map(r => r.circle_id);

  let rows;
  if (scope === 'public') {
    rows = db.prepare(`SELECT * FROM posts WHERE circle_id IS NULL OR circle_id='public' ORDER BY created_at DESC LIMIT 100`).all();
  } else if (scope === 'all') {
    const ph = myCircles.map(() => '?').join(',');
    rows = db.prepare(`SELECT * FROM posts WHERE circle_id IS NULL OR circle_id='public'
                       ${myCircles.length ? `OR circle_id IN (${ph})` : ''} ORDER BY created_at DESC LIMIT 100`).all(...myCircles);
  } else {
    if (!myCircles.includes(scope)) return res.status(403).json({ error: 'not_a_member' });
    rows = db.prepare(`SELECT * FROM posts WHERE circle_id=? ORDER BY created_at DESC LIMIT 100`).all(scope);
  }
  res.json(rows.map(p => hydrate(p, me)));
});

// ── create a share ────────────────────────────────────────────────
router.post('/posts', (req, res) => {
  const { track, caption, target } = req.body;   // track = normalized, target = 'public' | circleId
  if (!track?.id) return res.status(400).json({ error: 'missing_track' });
  let circleId = null;
  if (target && target !== 'public') {
    const member = db.prepare('SELECT 1 FROM circle_members WHERE circle_id=? AND user_id=?').get(target, req.user.id);
    if (!member) return res.status(403).json({ error: 'not_a_member' });
    circleId = target;
  }
  const id = uid();
  db.prepare(`INSERT INTO posts (id, user_id, circle_id, track_id, track_title, track_artist, track_album, track_art, track_url, caption, created_at)
              VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, req.user.id, circleId, track.id, track.title, track.artist, track.album || '', track.art || '', track.url || '',
         (caption || '').slice(0, 280) || null, now());

  // notify circle members (or skip for public)
  if (circleId) {
    const members = db.prepare('SELECT user_id FROM circle_members WHERE circle_id=? AND user_id!=?').all(circleId, req.user.id);
    const cname = db.prepare('SELECT name FROM circles WHERE id=?').get(circleId).name;
    for (const m of members) notify(m.user_id, req.user.id, 'share', `shared ${track.title} in ${cname}`, id);
  }
  res.json(hydrate(db.prepare('SELECT * FROM posts WHERE id=?').get(id), req.user.id));
});

// ── react (toggle / swap; one reaction per user per post) ─────────
router.post('/posts/:id/react', (req, res) => {
  const { emoji } = req.body;
  const post = db.prepare('SELECT * FROM posts WHERE id=?').get(req.params.id);
  if (!post) return res.status(404).json({ error: 'not_found' });
  const existing = db.prepare('SELECT emoji FROM reactions WHERE post_id=? AND user_id=?').get(post.id, req.user.id);
  if (existing && existing.emoji === emoji) {
    db.prepare('DELETE FROM reactions WHERE post_id=? AND user_id=?').run(post.id, req.user.id);
  } else {
    db.prepare(`INSERT INTO reactions (post_id, user_id, emoji) VALUES (?,?,?)
                ON CONFLICT(post_id, user_id) DO UPDATE SET emoji=excluded.emoji`).run(post.id, req.user.id, emoji);
    if (post.user_id !== req.user.id) notify(post.user_id, req.user.id, 'reaction', `reacted ${emoji} to your share of ${post.track_title}`, post.id);
  }
  res.json(hydrate(db.prepare('SELECT * FROM posts WHERE id=?').get(post.id), req.user.id));
});

// ── reply ─────────────────────────────────────────────────────────
router.post('/posts/:id/reply', (req, res) => {
  const text = (req.body.text || '').trim();
  if (!text) return res.status(400).json({ error: 'empty' });
  const post = db.prepare('SELECT * FROM posts WHERE id=?').get(req.params.id);
  if (!post) return res.status(404).json({ error: 'not_found' });
  db.prepare('INSERT INTO replies (id, post_id, user_id, text, created_at) VALUES (?,?,?,?,?)')
    .run(uid(), post.id, req.user.id, text.slice(0, 280), now());
  if (post.user_id !== req.user.id) notify(post.user_id, req.user.id, 'reply', `replied: "${text.slice(0, 40)}"`, post.id);
  res.json(hydrate(db.prepare('SELECT * FROM posts WHERE id=?').get(post.id), req.user.id));
});

// ── circles ───────────────────────────────────────────────────────
router.get('/circles', (req, res) => {
  const rows = db.prepare(`SELECT c.* FROM circles c JOIN circle_members m ON m.circle_id=c.id WHERE m.user_id=? ORDER BY c.created_at DESC`).all(req.user.id);
  res.json(rows.map(c => decorateCircle(c)));
});

function decorateCircle(c) {
  const members = db.prepare(`SELECT u.* FROM users u JOIN circle_members m ON m.user_id=u.id WHERE m.circle_id=?`).all(c.id).map(publicUser);
  const shares = db.prepare('SELECT COUNT(*) n FROM posts WHERE circle_id=?').get(c.id).n;
  return { id: c.id, name: c.name, emoji: c.emoji, cover: c.cover, members, shares };
}

router.get('/circles/:id', (req, res) => {
  const member = db.prepare('SELECT 1 FROM circle_members WHERE circle_id=? AND user_id=?').get(req.params.id, req.user.id);
  if (!member) return res.status(403).json({ error: 'not_a_member' });
  const c = db.prepare('SELECT * FROM circles WHERE id=?').get(req.params.id);
  if (!c) return res.status(404).json({ error: 'not_found' });
  const posts = db.prepare('SELECT * FROM posts WHERE circle_id=? ORDER BY created_at DESC').all(c.id).map(p => hydrate(p, req.user.id));
  res.json({ ...decorateCircle(c), posts });
});

const COVERS = [
  'linear-gradient(135deg,oklch(0.75 0.18 130),oklch(0.5 0.2 180))',
  'linear-gradient(135deg,oklch(0.72 0.16 300),oklch(0.4 0.2 260))',
  'linear-gradient(135deg,oklch(0.8 0.14 70),oklch(0.55 0.2 20))'
];
router.post('/circles', (req, res) => {
  const name = (req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'missing_name' });
  const emoji = req.body.emoji || '🎵';
  const memberIds = Array.isArray(req.body.memberIds) ? req.body.memberIds : [];
  const id = uid();
  db.prepare('INSERT INTO circles (id, name, emoji, cover, owner_id, created_at) VALUES (?,?,?,?,?,?)')
    .run(id, name.slice(0, 50), emoji, COVERS[Math.floor(Math.random() * COVERS.length)], req.user.id, now());
  const add = db.prepare('INSERT OR IGNORE INTO circle_members (circle_id, user_id) VALUES (?,?)');
  add.run(id, req.user.id);
  for (const m of memberIds) {
    if (db.prepare('SELECT 1 FROM users WHERE id=?').get(m)) {
      add.run(id, m);
      notify(m, req.user.id, 'invite', `added you to ${name}`, null);
    }
  }
  res.json(decorateCircle(db.prepare('SELECT * FROM circles WHERE id=?').get(id)));
});

// ── people (for invites, follows, discovery) ──────────────────────
router.get('/users', (req, res) => {
  const q = (req.query.q || '').toLowerCase();
  const rows = db.prepare('SELECT * FROM users WHERE id!=? ORDER BY created_at DESC LIMIT 50').all(req.user.id);
  const filtered = q ? rows.filter(u => (u.display_name + u.handle).toLowerCase().includes(q)) : rows;
  const followingSet = new Set(db.prepare('SELECT followee_id FROM follows WHERE follower_id=?').all(req.user.id).map(r => r.followee_id));
  res.json(filtered.map(u => ({ ...publicUser(u), following: followingSet.has(u.id) })));
});

router.get('/users/:id', (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);
  if (!u) return res.status(404).json({ error: 'not_found' });
  const posts = db.prepare(`SELECT * FROM posts WHERE user_id=? AND (circle_id IS NULL OR circle_id='public') ORDER BY created_at DESC LIMIT 30`)
    .all(u.id).map(p => hydrate(p, req.user.id));
  const following = !!db.prepare('SELECT 1 FROM follows WHERE follower_id=? AND followee_id=?').get(req.user.id, u.id);
  res.json({ ...publicUser(u), following, posts });
});

router.post('/users/:id/follow', (req, res) => {
  if (req.params.id === req.user.id) return res.status(400).json({ error: 'self' });
  const exists = db.prepare('SELECT 1 FROM follows WHERE follower_id=? AND followee_id=?').get(req.user.id, req.params.id);
  if (exists) db.prepare('DELETE FROM follows WHERE follower_id=? AND followee_id=?').run(req.user.id, req.params.id);
  else {
    db.prepare('INSERT INTO follows (follower_id, followee_id) VALUES (?,?)').run(req.user.id, req.params.id);
    notify(req.params.id, req.user.id, 'follow', 'started following you', null);
  }
  res.json({ following: !exists });
});

// ── notifications ─────────────────────────────────────────────────
function notify(userId, actorId, type, text, postId) {
  db.prepare('INSERT INTO notifications (id, user_id, actor_id, type, text, post_id, read, created_at) VALUES (?,?,?,?,?,?,0,?)')
    .run(uid(), userId, actorId, type, text, postId, now());
}
router.get('/notifications', (req, res) => {
  const rows = db.prepare('SELECT * FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 50').all(req.user.id);
  const out = rows.map(n => ({ id: n.id, type: n.type, text: n.text, read: !!n.read, created_at: n.created_at,
    actor: publicUser(db.prepare('SELECT * FROM users WHERE id=?').get(n.actor_id)) }));
  db.prepare('UPDATE notifications SET read=1 WHERE user_id=?').run(req.user.id);
  res.json(out);
});
router.get('/notifications/unread', (req, res) => {
  res.json({ count: db.prepare('SELECT COUNT(*) c FROM notifications WHERE user_id=? AND read=0').get(req.user.id).c });
});

// ── Spotify data proxy (Plane A) ──────────────────────────────────
router.get('/spotify/now-playing', async (req, res) => {
  try {
    const data = await spotifyGet(req.user, '/me/player/currently-playing');
    res.json({ track: data?.item ? normalizeTrack(data.item) : null, isPlaying: !!data?.is_playing });
  } catch (e) { res.status(502).json({ error: 'spotify_error', detail: String(e.message) }); }
});
router.get('/spotify/top-tracks', async (req, res) => {
  try {
    const data = await spotifyGet(req.user, '/me/top/tracks?limit=10&time_range=short_term');
    res.json((data?.items || []).map(normalizeTrack));
  } catch (e) { res.status(502).json({ error: 'spotify_error', detail: String(e.message) }); }
});
router.get('/spotify/recent', async (req, res) => {
  try {
    const data = await spotifyGet(req.user, '/me/player/recently-played?limit=20');
    res.json((data?.items || []).map(i => normalizeTrack(i.track)));
  } catch (e) { res.status(502).json({ error: 'spotify_error', detail: String(e.message) }); }
});
// Searches Spotify for both songs and artists. Returns { tracks, artists }.
router.get('/spotify/search', async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.json({ tracks: [], artists: [] });
  try {
    const params = new URLSearchParams({ q, type: 'track,artist', limit: '10' });
    const data = await spotifyGet(req.user, `/search?${params.toString()}`);
    res.json({
      tracks: (data?.tracks?.items || []).map(normalizeTrack),
      artists: (data?.artists?.items || []).map(normalizeArtist)
    });
  } catch (e) { console.error('  search error:', e.message); res.status(502).json({ error: 'spotify_error', detail: String(e.message) }); }
});

// Gives the browser a valid access token for the Web Playback SDK (Premium-only playback).
router.get('/spotify/token', async (req, res) => {
  try { res.json({ token: await validToken(req.user) }); }
  catch (e) { res.status(502).json({ error: 'spotify_error', detail: String(e.message) }); }
});

// Start playing a track on a given device (the in-app web player).
router.put('/spotify/play', async (req, res) => {
  const { uri, deviceId } = req.body;
  if (!uri || !deviceId) return res.status(400).json({ error: 'missing_params' });
  try {
    await spotifyPut(req.user, `/me/player/play?device_id=${encodeURIComponent(deviceId)}`, { uris: [uri] });
    res.json({ ok: true });
  } catch (e) { res.status(502).json({ error: 'spotify_error', detail: String(e.message) }); }
});

// An artist's top tracks (so you can tap an artist and share their songs).
router.get('/spotify/artist/:id/top', async (req, res) => {
  try {
    const data = await spotifyGet(req.user, `/artists/${encodeURIComponent(req.params.id)}/top-tracks?market=US`);
    res.json((data?.tracks || []).map(normalizeTrack));
  } catch (e) { res.status(502).json({ error: 'spotify_error', detail: String(e.message) }); }
});

export default router;
