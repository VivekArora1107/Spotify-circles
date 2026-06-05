// ── index.js — Express app entry point ────────────────────────────
import 'dotenv/config';
import express from 'express';
import cookieSession from 'cookie-session';
import path from 'path';
import { fileURLToPath } from 'url';

import authRoutes from './routes/auth.js';
import apiRoutes from './routes/api.js';
import { startAutoShareScheduler } from './autoshare.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 8888;

// fail fast if not configured
for (const key of ['SPOTIFY_CLIENT_ID', 'SPOTIFY_CLIENT_SECRET', 'SPOTIFY_REDIRECT_URI']) {
  const val = process.env[key];
  if (!val || /paste_your|your_.*_here|change_me/i.test(val)) {
    console.error(`\n  ✗ ${key} is not set yet.\n    Open the ".env" file in the circles-app folder and paste your value for ${key}.\n    (Get Spotify values from https://developer.spotify.com/dashboard)\n`);
    process.exit(1);
  }
}

app.use(express.json());
app.use(cookieSession({
  name: 'circles',
  secret: process.env.SESSION_SECRET || 'dev-insecure-secret',
  maxAge: 30 * 24 * 60 * 60 * 1000,
  sameSite: 'lax',
  httpOnly: true
}));

app.use('/auth', authRoutes);
app.use('/api', apiRoutes);

// static frontend
app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));

app.listen(PORT, () => {
  console.log(`\n  ● Circles running →  http://127.0.0.1:${PORT}\n`);
  startAutoShareScheduler();
});
