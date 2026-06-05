// ── routes/auth.js — Spotify login / logout / session ─────────────
import { Router } from 'express';
import crypto from 'crypto';
import db from '../db.js';
import { authorizeUrl, exchangeCode, getProfile, normalizeTrack } from '../spotify.js';

const router = Router();

const COLORS = [
  'oklch(0.85 0.18 130)', 'oklch(0.75 0.17 10)', 'oklch(0.75 0.14 240)',
  'oklch(0.72 0.16 300)', 'oklch(0.8 0.14 70)', 'oklch(0.78 0.16 160)',
  'oklch(0.72 0.14 30)', 'oklch(0.75 0.14 200)'
];
const uid = () => crypto.randomBytes(9).toString('base64url');

// Kick off Spotify OAuth
router.get('/login', (req, res) => {
  const state = crypto.randomBytes(12).toString('hex');
  req.session.oauthState = state;
  res.redirect(authorizeUrl(state));
});

// OAuth redirect target
router.get('/callback', async (req, res) => {
  const { code, state, error } = req.query;
  if (error) return res.redirect('/?error=' + encodeURIComponent(error));
  if (!code || state !== req.session.oauthState) return res.redirect('/?error=state_mismatch');
  req.session.oauthState = null;

  try {
    const tokens = await exchangeCode(code);
    const profile = await getProfile(tokens.access_token);
    const expires = Date.now() + (tokens.expires_in - 60) * 1000;

    const existing = db.prepare('SELECT * FROM users WHERE id=?').get(profile.id);
    if (existing) {
      db.prepare('UPDATE users SET display_name=?, avatar_url=?, access_token=?, refresh_token=?, token_expires=? WHERE id=?')
        .run(profile.display_name || existing.display_name, profile.images?.[0]?.url || existing.avatar_url,
             tokens.access_token, tokens.refresh_token || existing.refresh_token, expires, profile.id);
    } else {
      // derive a unique handle
      let base = (profile.display_name || profile.id).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 14) || 'user';
      let handle = base, n = 1;
      while (db.prepare('SELECT 1 FROM users WHERE handle=?').get(handle)) handle = base + (++n);
      const color = COLORS[Math.floor(Math.random() * COLORS.length)];
      db.prepare(`INSERT INTO users (id, display_name, handle, avatar_url, avatar_color, access_token, refresh_token, token_expires, created_at)
                  VALUES (?,?,?,?,?,?,?,?,?)`)
        .run(profile.id, profile.display_name || handle, handle, profile.images?.[0]?.url || null,
             color, tokens.access_token, tokens.refresh_token, expires, Date.now());
    }

    req.session.userId = profile.id;
    res.redirect('/');
  } catch (e) {
    console.error(e);
    res.redirect('/?error=' + encodeURIComponent('auth_failed'));
  }
});

router.post('/logout', (req, res) => {
  req.session = null;
  res.json({ ok: true });
});

export default router;
