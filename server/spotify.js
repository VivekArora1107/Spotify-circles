// ── spotify.js — Plane A: read-only music layer (OAuth + API) ─────
import db from './db.js';

const AUTH = 'https://accounts.spotify.com';
const API = 'https://api.spotify.com/v1';

export const SCOPES = [
  'user-read-email',
  'user-read-private',
  'user-read-currently-playing',
  'user-read-recently-played',
  'user-top-read',
  'streaming',                    // required by the Web Playback SDK
  'user-modify-playback-state',   // start/transfer playback
  'user-read-playback-state'
].join(' ');

export function authorizeUrl(state) {
  const p = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.SPOTIFY_CLIENT_ID,
    scope: SCOPES,
    redirect_uri: process.env.SPOTIFY_REDIRECT_URI,
    state
  });
  return `${AUTH}/authorize?${p.toString()}`;
}

function basicAuth() {
  const raw = `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`;
  return 'Basic ' + Buffer.from(raw).toString('base64');
}

// Exchange the auth code for tokens
export async function exchangeCode(code) {
  const res = await fetch(`${AUTH}/api/token`, {
    method: 'POST',
    headers: { Authorization: basicAuth(), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: process.env.SPOTIFY_REDIRECT_URI
    })
  });
  if (!res.ok) throw new Error('Token exchange failed: ' + (await res.text()));
  return res.json(); // { access_token, refresh_token, expires_in, ... }
}

async function refresh(user) {
  const res = await fetch(`${AUTH}/api/token`, {
    method: 'POST',
    headers: { Authorization: basicAuth(), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: user.refresh_token })
  });
  if (!res.ok) throw new Error('Token refresh failed');
  const t = await res.json();
  const expires = Date.now() + (t.expires_in - 60) * 1000;
  db.prepare('UPDATE users SET access_token=?, token_expires=?, refresh_token=COALESCE(?, refresh_token) WHERE id=?')
    .run(t.access_token, expires, t.refresh_token || null, user.id);
  return t.access_token;
}

// Returns a valid access token for a user row, refreshing if needed.
export async function validToken(user) {
  if (user.token_expires > Date.now() + 5000) return user.access_token;
  return refresh(user);
}

// Authenticated GET against the Spotify API for a given user.
export async function spotifyGet(user, pathAndQuery) {
  const token = await validToken(user);
  const res = await fetch(`${API}${pathAndQuery}`, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 204) return null;          // e.g. nothing currently playing
  if (!res.ok) throw new Error(`Spotify ${res.status}: ${await res.text()}`);
  return res.json();
}

// Authenticated PUT against the Spotify API (e.g. transfer/start playback).
export async function spotifyPut(user, pathAndQuery, body) {
  const token = await validToken(user);
  const res = await fetch(`${API}${pathAndQuery}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  if (res.status === 204 || res.ok) return null;
  throw new Error(`Spotify ${res.status}: ${await res.text()}`);
}

export async function getProfile(accessToken) {
  const res = await fetch(`${API}/me`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`Failed to load profile — Spotify returned ${res.status}: ${await res.text()}`);
  return res.json();
}

// Normalise a Spotify track object into Circles' compact shape.
export function normalizeTrack(t) {
  if (!t) return null;
  return {
    id: t.id,
    title: t.name,
    artist: (t.artists || []).map(a => a.name).join(', '),
    album: t.album?.name || '',
    art: t.album?.images?.[0]?.url || '',
    url: t.external_urls?.spotify || ''
  };
}

// Normalise a Spotify artist object.
export function normalizeArtist(a) {
  if (!a) return null;
  return {
    id: a.id,
    name: a.name,
    image: a.images?.[0]?.url || '',
    genres: (a.genres || []).slice(0, 2),
    followers: a.followers?.total || 0,
    url: a.external_urls?.spotify || ''
  };
}
