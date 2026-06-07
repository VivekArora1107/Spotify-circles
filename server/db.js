// ── db.js — SQLite (Plane B: Circles' own social layer) ───────────
// Uses Node's BUILT-IN sqlite engine (node:sqlite) — no install/compile needed.
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = new DatabaseSync(path.join(__dirname, '..', 'circles.db'));
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  display_name  TEXT NOT NULL,
  handle        TEXT UNIQUE NOT NULL,
  avatar_url    TEXT,
  avatar_color  TEXT NOT NULL,
  bio           TEXT DEFAULT '',
  access_token  TEXT,
  refresh_token TEXT,
  token_expires INTEGER DEFAULT 0,
  created_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS circles (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  emoji      TEXT DEFAULT '🎵',
  cover      TEXT,
  owner_id   TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS circle_members (
  circle_id TEXT NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
  user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (circle_id, user_id)
);

CREATE TABLE IF NOT EXISTS posts (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id),
  circle_id    TEXT,
  track_id     TEXT NOT NULL,
  track_title  TEXT NOT NULL,
  track_artist TEXT NOT NULL,
  track_album  TEXT,
  track_art    TEXT,
  track_url    TEXT,
  caption      TEXT,
  created_at   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS reactions (
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji   TEXT NOT NULL,
  PRIMARY KEY (post_id, user_id)
);

CREATE TABLE IF NOT EXISTS replies (
  id         TEXT PRIMARY KEY,
  post_id    TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id),
  text       TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS follows (
  follower_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  followee_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (follower_id, followee_id)
);

CREATE TABLE IF NOT EXISTS notifications (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actor_id   TEXT NOT NULL REFERENCES users(id),
  type       TEXT NOT NULL,
  text       TEXT NOT NULL,
  post_id    TEXT,
  read       INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS saved_tracks (
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  track_id   TEXT NOT NULL,
  title      TEXT NOT NULL,
  artist     TEXT NOT NULL,
  album      TEXT,
  art        TEXT,
  url        TEXT,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, track_id)
);

CREATE INDEX IF NOT EXISTS idx_posts_circle ON posts(circle_id);
CREATE INDEX IF NOT EXISTS idx_posts_user   ON posts(user_id);
CREATE INDEX IF NOT EXISTS idx_notif_user   ON notifications(user_id);
`);

// ── lightweight migrations (safe to re-run) ───────────────────────
for (const stmt of [
  'ALTER TABLE users ADD COLUMN auto_share INTEGER DEFAULT 0',
  'ALTER TABLE users ADD COLUMN last_auto_date TEXT',
  'ALTER TABLE users ADD COLUMN last_auto_track TEXT',
  'ALTER TABLE users ADD COLUMN pending_track TEXT',
  'ALTER TABLE users ADD COLUMN pending_date TEXT'
]) {
  try { db.exec(stmt); } catch { /* column already exists */ }
}

export default db;
