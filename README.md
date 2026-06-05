# 🎧 Circles — Social Music

**A standalone social-listening app built on top of Spotify.** Sign in with your real Spotify account and share what you're listening to — publicly or with small private groups ("circles") — where friends can react and reply. Spotify is the music source; everything social lives in the app's own backend.

> Circles is **not** a Spotify feature or a clone of Spotify's UI. It's its own product that uses Spotify only to read your account and listening data. The social layer (circles, feed, reactions, replies, follows, notifications) is fully owned by this app.

---

## Table of contents

1. [The problem it solves](#1-the-problem-it-solves)
2. [What it does (features)](#2-what-it-does-features)
3. [How it works (architecture)](#3-how-it-works-architecture)
4. [Tech stack](#4-tech-stack)
5. [Run it yourself — full setup](#5-run-it-yourself--full-setup)
6. [The Spotify rules you must know](#6-the-spotify-rules-you-must-know-important)
7. [Letting friends use your instance](#7-letting-friends-use-your-instance)
8. [Deploying online](#8-deploying-online-optional)
9. [Project structure](#9-project-structure)
10. [Security notes](#10-security-notes)
11. [Product documentation (PRD)](#11-product-documentation)

---

## 1. The problem it solves

Music is one of the most social things people do, but *listening* has become almost entirely private. Spotify is great at playback and personalization and weak at conversation — its social surface is thin (a desktop-only Friend Activity sidebar, Blend, once-a-year Wrapped). So the conversation about music has leaked into tools never built for it: group chats, Stories, screenshots of lock screens. A screenshot isn't playable, a Story disappears, a group chat buries the track.

**Circles gives music listeners a dedicated, low-friction place to share what they're playing with the right audience — public or a small private circle — and get a real reaction (reactions + replies), with the actual track one tap away in Spotify.**

The target user is the socially-motivated listener (roughly 18–35) who already shares music informally and is frustrated by the clumsy tools they use to do it.

---

## 2. What it does (features)

- **Real Spotify login.** Sign in with your actual Spotify account via OAuth. Your Spotify identity *is* your Circles account.
- **Home feed.** A feed of shares, filterable by **All / Public / each of your circles**.
- **Share a track.** Search Spotify, or share what's **currently playing**; choose **Public** or a **private circle**; add an optional caption.
- **React & reply.** One-tap emoji reactions (❤️ 🔥 😂 😮 🫶, swappable) and threaded text replies on every share.
- **Circles.** Create private groups and invite other members; target shares at a specific circle.
- **Live Spotify search.** Search **songs and artists** straight from Spotify. Tap an artist to see their **top tracks**, each ready to share. Also find other people on Circles to follow.
- **▶ In-app playback (Premium).** Tap any track to play the **full song right inside Circles** via Spotify's Web Playback SDK, with a play/pause bar. Requires a Premium account (Spotify's rule for SDK playback).
- **Now-playing bar.** Shows your current Spotify track; one tap shares it.
- **Profile / Library.** Editable music bio, your **top tracks this month** (from Spotify), and your recent shares.
- **Follows & notifications.** Follow people; get notified for reactions, replies, circle invites, and new followers.
- **🤖 Daily auto-share.** An optional toggle: once a day the app automatically posts your **#1 top track** to Public, using your stored Spotify token (works even with no browser open). Posts at most once per day, skips reposting the same song, and has a **"Share today's top track now"** button to run it on demand.

Everything persists in a local SQLite database (`circles.db`), and multiple people can sign in and genuinely socialise (subject to Spotify's user limit — see [section 6](#6-the-spotify-rules-you-must-know-important)).

---

## 3. How it works (architecture)

Circles deliberately separates two "planes":

- **Plane A — Music (read-only, Spotify):** identity, currently-playing, top tracks, and song/artist search come from the Spotify Web API. The app never writes here and never stores audio.
- **Plane B — Social (read-write, this app):** the social graph (follows, circle membership), feed, reactions, replies, and notifications live in this app's own database. No Spotify change can take this away.

```
 ┌─────────────┐   OAuth / reads    ┌──────────────────┐
 │  Spotify    │◀───────────────────│   Circles app    │
 │  Web API    │  identity, now-    │  (web / PWA)     │
 │ (Plane A)   │  playing, search   └────────┬─────────┘
 └─────────────┘                             │ reads + writes
                                             ▼
                                   ┌──────────────────┐
                                   │ Circles backend  │
                                   │ feed, circles,   │
                                   │ reactions, replies│
                                   │ notifs, auto-share│
                                   └──────────────────┘
```

A shared track is stored as a **reference** (Spotify track id + cached title/artist/art), never as audio — so the app hosts no catalog and runs cheaply. Tapping a track opens it in Spotify.

---

## 4. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Backend | Node.js + Express | Simple, ubiquitous, easy to run |
| Database | **`node:sqlite`** (built into Node 22+) | Zero install, nothing to compile, file-based |
| Auth | Spotify OAuth (Authorization Code) | The music source *is* the login |
| Frontend | Single-page app, vanilla JS + CSS | No build step; responsive mobile + desktop |
| Automation | In-process hourly scheduler | Runs the daily auto-share with a once-per-day guard |

There are only three npm dependencies (`express`, `cookie-session`, `dotenv`) — all pure JavaScript, so `npm install` never has to compile anything.

---

## 5. Run it yourself — full setup

Anyone can run their own copy. It takes about 10–15 minutes.

### Prerequisites

- **Node.js 22 or newer** (the built-in SQLite engine requires it). Check with `node --version`; install the LTS build from <https://nodejs.org> if needed.
- A **Spotify account with an active Premium subscription** (required — see [section 6](#6-the-spotify-rules-you-must-know-important)).

### Step 1 — Create a Spotify developer app

1. Go to the **Spotify Developer Dashboard**: <https://developer.spotify.com/dashboard>
2. Log in and click **Create app**. Give it any name/description.
3. Under **Redirect URIs**, add exactly:
   ```
   http://127.0.0.1:8888/auth/callback
   ```
4. For "Which API/SDKs are you planning to use?", tick **Web API**. Save.
5. Open the app's **Settings** and copy the **Client ID** and **Client secret**.
6. Open **Settings → User Management** and add **your own name + the email on your Spotify account** (and any friends you want to let in — up to 5 people total).

### Step 2 — Configure the project

From the `circles-app` folder:

```bash
# install dependencies (fast — nothing is compiled)
npm install

# create your .env from the template
cp .env.example .env        # macOS/Linux
copy .env.example .env      # Windows PowerShell
```

Open `.env` and fill in the first two lines with the values from the dashboard:

```
SPOTIFY_CLIENT_ID=your_client_id
SPOTIFY_CLIENT_SECRET=your_client_secret
SPOTIFY_REDIRECT_URI=http://127.0.0.1:8888/auth/callback
SESSION_SECRET=any_long_random_string
PORT=8888
```

### Step 3 — Run it

```bash
npm start
```

When you see `● Circles running → http://127.0.0.1:8888`, open that link and click **Connect with Spotify**.

> Use `127.0.0.1`, **not** `localhost` — it must match the redirect URI exactly.

To start fresh, stop the server (Ctrl+C) and delete `circles.db`.

---

## 6. The Spotify rules you must know (important)

As of **February 2026**, a new Spotify app runs in **Development Mode**, which has two hard rules this app cannot bypass:

1. **The app owner must have Spotify Premium.** Without it, Spotify returns
   `403: Active premium subscription required for the owner of the app`.
   If you just upgraded, note that **it can take a few hours** for Spotify to recognise the change.
2. **Each user must be allow-listed**, up to **5 users total**. Add each person under
   **Dashboard → your app → Settings → User Management** (their name + the email on their Spotify account).

To serve more than ~5 people you'd need **Extended Quota Mode**, which Spotify grants only to registered businesses with an established service (their published bar is ~**250,000 monthly active users**). This "need scale to get access, but capped at 5 until you have it" catch-22 is the core platform risk for any Spotify-based app — it's discussed in detail in [`docs/PRD.md`](docs/PRD.md) (section 9).

Also: **now-playing** and **top tracks** need an account with recent listening activity. If nothing is playing, the now-playing bar simply stays hidden, and a brand-new account may have no top tracks until it has some history.

---

## 7. Letting friends use your instance

Because of the 5-user cap, you can invite a few people:

1. Add each friend under **Settings → User Management** in your Spotify dashboard (name + their Spotify email).
2. They need network access to your running app. On the same machine that's just `http://127.0.0.1:8888`; for others, either deploy it online ([section 8](#8-deploying-online-optional)) or expose your local server with a tunnel (e.g. ngrok) and add that tunnel's `/auth/callback` URL to both your `.env` and the Spotify app's Redirect URIs.

---

## 8. Deploying online (optional)

To host it (e.g. Render, Railway, Fly.io, a VPS):

1. Set the same environment variables in the host's dashboard.
2. Change `SPOTIFY_REDIRECT_URI` to your deployed URL's `/auth/callback`, and add that URL to the Spotify app's Redirect URIs.
3. SQLite writes to a local file — use a host with a **persistent disk**, or migrate to Postgres for production (the schema in `server/db.js` ports directly).
4. Serve over **HTTPS** and set the session cookie to `secure` in `server/index.js`.

---

## 9. Project structure

```
circles-app/
├── package.json
├── .env.example          # template for your secrets (safe to commit)
├── .gitignore            # keeps .env, node_modules, *.db out of git
├── README.md             # this file
├── docs/
│   └── PRD.md            # product requirements & technical reasoning
├── server/
│   ├── index.js          # Express app, sessions, static hosting, scheduler
│   ├── db.js             # SQLite schema (the social layer)
│   ├── spotify.js        # OAuth + Spotify Web API wrapper (the music layer)
│   ├── autoshare.js      # daily "share my top track" job
│   └── routes/
│       ├── auth.js       # /auth/login, /auth/callback, /auth/logout
│       └── api.js        # /api/* — feed, circles, reactions, replies, search, auto-share
└── public/
    ├── index.html        # app shell
    ├── styles.css        # design system (lime-green / Inter / overlapping-circles logo)
    └── app.js            # single-page app logic (calls the API)
```

---

## 10. Security notes

- **Never commit `.env`.** It contains your Spotify Client Secret. The included `.gitignore` already excludes it — keep it that way.
- If your Client Secret was ever exposed, **rotate it**: Spotify Dashboard → your app → Settings → **Rotate client secret**, then update `.env`.
- `circles.db` holds user data and Spotify tokens; it's gitignored and should never be committed or shared.
- `SESSION_SECRET` should be a long random string unique to your deployment.

---

## 11. Product documentation

The full product requirements and technical architecture — problem, personas, feature epics, success metrics (HEART), the Spotify platform-dependency analysis, and roadmap — are in [`docs/PRD.md`](docs/PRD.md).

---

*Built as a portfolio project to demonstrate end-to-end product and engineering work. Not affiliated with Spotify. "Spotify" is a trademark of Spotify AB.*
