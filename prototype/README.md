# Circles — original clickable prototype

This folder holds the **first prototype** of Circles: a single self-contained HTML file (`circles-prototype.html`) that runs entirely in the browser on **mock data** — no backend, no Spotify login.

It came before the full working app (in the parent folder) and exists here to show the **design and product exploration** that led to the real build.

## How to view it

**Easiest — open it live in your browser (no download):**
👉 **https://raw.githack.com/VivekArora1107/Spotify-circles/main/prototype/circles-prototype.html**

> Note: clicking the `.html` file directly on GitHub only shows the source code — GitHub never runs HTML files. Use the link above (it serves the file as a real web page), or download the file and open it locally.

**Or locally:** download `circles-prototype.html` and double-click it (or drag it into any browser). Click **Connect with Spotify** (simulated) to enter, then explore the feed, circles, search, library, the share composer, reactions, and replies.

## What it demonstrates
- The full screen flow and interaction design: Home feed, Circles (+ create), Search, Library/Profile, Activity, a share composer, emoji reactions, and replies.
- The visual system later carried into the real app: near-black surfaces, the lime-green accent (`oklch(0.85 0.18 130)`), Inter typeface, and the overlapping-circles logo.
- An intentionally **API-shaped mock data layer** — the `SONGS`, `FRIENDS`, `CIRCLES`, and `FEED` arrays are structured the way real Spotify Web API and backend responses are, so the prototype could be swapped to live data with minimal UI change. (That's exactly what the full app in the parent folder does.)

## How this differs from the real app
| | Prototype (this folder) | Full app (parent folder) |
|---|---|---|
| Data | Mock arrays in the file | Real Spotify API + SQLite database |
| Login | Simulated button | Real Spotify OAuth |
| Playback | Visual only | Full in-app playback (Web Playback SDK) |
| Persistence | None (resets on refresh) | Persists; multi-user |

For the real, runnable application, see the [main README](../README.md).
