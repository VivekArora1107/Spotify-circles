# Circles — Product Requirements & Technical Architecture

*A standalone social-listening app built on top of Spotify. Not a Spotify feature — its own product.*

**Author:** Vivek Arora · **Status:** v2 (as-built / working app) · **Updated:** June 2026

> This document describes both the product thinking and the real implementation in this repository. Where v1 was a design concept, v2 reflects what is actually built and running: real Spotify OAuth, a real backend and database, live search, and an automated daily-share feature.

---

## 1. One-line pitch

Circles is a standalone app where you share what you're listening to — publicly or with small private groups ("circles") — and the people who get your taste can react and reply. It's the conversation layer that streaming never built.

---

## 2. Problem

Music is one of the most social things people do, yet the act of *listening* has become almost entirely private. Spotify is excellent at playback and personalization and weak at conversation. Its social surface is thin: a desktop-only Friend Activity sidebar, Blend playlists, and the once-a-year Wrapped moment. There is no good place to tell the four people who would actually care that a song is your whole week, and no lightweight way to react when a friend shares something.

So the conversation about music has leaked *out* of streaming apps into tools never built for it — group chats, Instagram Stories, screenshots of lock screens. Those are clumsy for music: a screenshot isn't playable, a Story disappears, a group chat buries the track.

**Problem statement:** People who care about music lack a dedicated, low-friction space to share what they're listening to with the right audience and get a real reaction — so the most social part of music happens in fragments across apps that were never designed for it.

---

## 3. Why a standalone app (not a Spotify feature)

This is the central product decision and it drives the technical design.

A feature inside Spotify would inherit Spotify's whole user base, including the majority who treat it as a utility and would never post. A standalone app self-selects for the social-listener segment — smaller but far denser and more engaged. It also isn't locked to Spotify users: the social graph lives in Circles' own backend, while the *music* layer connects to Spotify today and could add Apple Music or YouTube Music later. The trade-off is a hard platform dependency on Spotify's API, which is the single biggest risk (section 9) and the most interesting part of the technical story.

**Non-goal:** Circles does not replace the player. It does not stream audio, host a catalog, or compete on playback. It is a thin social layer that hands playback back to Spotify.

---

## 4. Target users

The wedge is **socially-motivated listeners aged 18–35** who already share music informally and are frustrated by the tools they use. Three personas guide the design:

**Emily — "The Social Listener," 24.** Shares songs in group chats constantly; her pain is that they vanish into chat history and nobody can play them. The core user and the activation target.

**Jason — "The Music Curator," 31.** Strong taste, wants an audience and a little status for finding things first. His pain is no feedback loop. He is the supply side — his shares give everyone a reason to open the app.

**Ayesha — "The Passive Browser," 27.** Loves music, rarely posts. She'll lurk and tap a reaction. Most users are Ayeshas, so the app must be rewarding to open even if you never post.

Designing for all three means: **posting must be near-frictionless** (Emily), **shares must get visible reactions** (Jason), and **the app must be valuable with zero posting** (Ayesha).

---

## 5. Goals, non-goals, hypothesis

**Hypothesis:** *If* we give 18–35 social listeners a dedicated space to share tracks with public or private audiences and react lightly, *then* they will share more and return regularly, *because* they already do this informally and only lack a tool built for it.

**Goals (v1/v2)**
- Make sharing a track take seconds from intent to posted.
- Make every share visibly reactable (reactions + threaded replies).
- Support both public sharing and small private circles from day one.
- Prove return behaviour — retention, not raw signups, is the bar.

**Non-goals**
- No in-app audio streaming or catalog hosting.
- No algorithmic recommendation engine (also impossible on Spotify's current API — see section 9).
- No DMs, Stories-style ephemerality, or monetization in v2.

---

## 6. Features (as built)

The app implements the following end-to-end:

- **Spotify login (real OAuth).** Authorization Code flow; the Spotify identity is the account. Tokens are stored server-side and refreshed automatically.
- **Home feed.** Reverse-chronological feed of shares, filterable by All / Public / each of your circles.
- **Share composer.** Pick a track (search Spotify, or use what's currently playing), choose an audience (Public or a specific circle), add an optional caption, post.
- **Reactions & replies.** One-tap emoji reactions (❤️ 🔥 😂 😮 🫶, swappable) and threaded text replies on every share.
- **Post management.** Authors can edit a share's caption and audience, or delete it (owner-only, with confirmation) — basic content control that any social product needs.
- **Saved tracks (bookmarks).** Save any song from the feed to a personal list in your Library — a natural music-app affordance that increases return value for passive users (the "Ayesha" persona) who consume more than they post.
- **Circles.** Create private groups, invite other members, and target shares at them. Circles can be created inline within the share flow (a "+ New circle" option in the composer), reducing friction to share with a brand-new group.
- **Search (live Spotify).** Searches Spotify for **songs and artists**; tapping an artist shows their top tracks, each shareable. Also finds other people on Circles to follow.
- **In-app playback (Premium).** Tap any track to play the full song inside Circles via Spotify's Web Playback SDK, with a play/pause bar — no need to leave the app.
- **Now-playing bar.** Polls your Spotify currently-playing track; one tap shares it.
- **Profile / Library.** Music bio (editable), your top tracks this month (from Spotify), and your recent shares.
- **Follows & notifications.** Follow people; get notified for reactions, replies, circle invites, and new followers.
- **Daily top-track suggestion (human-in-the-loop automation).** An optional per-user toggle: once a day the server reads your #1 top track and prepares it as a *suggestion* (using your stored Spotify token, so it works with no browser open). The app then **asks before sharing** — you confirm, choose the audience (Public or a circle), and add a caption. Nothing posts without your approval, and you can skip the day. This deliberately keeps a human in the loop rather than auto-posting, addressing the risk of unwanted automatic public shares.

### Representative user stories (Given / When / Then)

- *Share:* **Given** I'm listening to a song, **when** I tap share, **then** the composer opens pre-filled with that track.
- *Audience:* **Given** I'm composing, **when** I choose a private circle, **then** only that circle's members can see it.
- *React:* **Given** a friend shared a track, **when** I tap a reaction, **then** it appears on the post and they're notified.
- *Automation:* **Given** I enabled daily auto-share, **when** a new day begins, **then** my current #1 top track is posted to Public automatically.

---

## 7. Architecture

The defining idea: **two data planes with a clean seam between them.**

**Plane A — the music layer (read-only, Spotify-owned).** Identity, currently-playing, top tracks, and track/artist search come from the Spotify Web API via OAuth. Circles never writes here and never stores audio.

**Plane B — the social layer (read-write, Circles-owned).** The social graph (follows, circle membership), the feed, reactions, replies, and notifications live in Circles' own database. This is where all product value accrues, and no Spotify API change can revoke it.

```
 ┌─────────────┐   OAuth / reads    ┌──────────────────┐
 │  Spotify    │◀───────────────────│   Circles app    │
 │  Web API    │  identity, now-    │  (web / PWA)     │
 │ (Plane A)   │  playing, search   └────────┬─────────┘
 └─────────────┘                             │ reads + writes
                                             ▼
                                   ┌──────────────────┐
                                   │ Circles backend  │
                                   │ (Plane B):       │
                                   │ social graph,    │
                                   │ feed, reactions, │
                                   │ replies, notifs, │
                                   │ daily auto-share │
                                   └──────────────────┘
```

A shared track is stored in Plane B as a *reference* (Spotify track id + cached title/artist/art), never as audio. Tapping a track opens it in Spotify. This keeps Circles legally clean (no catalog, no audio) and cheap to run (no streaming infrastructure).

**Implementation stack (this repo):**
- **Backend:** Node.js + Express.
- **Database:** SQLite via Node's **built-in** `node:sqlite` module — zero install, nothing to compile.
- **Auth:** Spotify OAuth (Authorization Code), tokens stored per user and auto-refreshed.
- **Frontend:** single-page app (vanilla JS, responsive for mobile + desktop), served by the backend.
- **Automation:** an in-process hourly scheduler runs the daily auto-share with a once-per-day guard.

Because Plane A is read-only and swappable, Circles can survive Spotify API changes, degrade gracefully, or add another music provider — all without touching the social core.

---

## 8. Success metrics (HEART)

| Dimension | Question | Example metric |
|---|---|---|
| **Happiness** | Do users like it? | Reactions per share; qualitative sentiment |
| **Engagement** | Are they active? | Shares per active user per week; replies per share |
| **Adoption** | Are new users posting? | % of new users who share within 48h |
| **Retention** | Do they come back? | **D7 / D30 return rate** (north-star) |
| **Task success** | Is the core flow smooth? | Time-to-share; composer completion rate |

**North-star metric:** *weekly returning sharers* — users who both return in a week and post at least one share. It captures the whole loop and resists vanity-signup inflation.

---

## 9. The Spotify platform-dependency risk (the crux)

This is the most important section, and it is real and current — not hypothetical. Building this app surfaced the constraints first-hand.

**What's happened to Spotify's API:**
- **November 2024:** Spotify deprecated a swathe of endpoints for new apps — Recommendations, Related Artists, Audio Features, Audio Analysis, 30-second previews, featured/editorial playlists — citing security and data-scraping abuse.
- **April/May 2025:** Spotify tightened Extended Quota Mode, reserving extended access for apps with "established, scalable, and impactful" use cases that advance Spotify's own strategy.
- **February 2026:** New Development Mode client IDs were capped at **up to five authorized users**.

**Two constraints we hit building this app:**
1. **Owner must have Premium.** In Development Mode, the *owner of the Spotify app* must hold an active Premium subscription, or the API returns `403: Active premium subscription required for the owner of the app`. (And it can take a few hours after upgrading for Spotify to recognise it.)
2. **Users must be allow-listed.** Each person who logs in must be added under the app's **User Management** in the Spotify dashboard, up to the 5-user cap.

**The catch-22.** To serve real users at scale you need Extended Quota Mode, which requires being a registered business with a launched service and roughly **250,000 monthly active users** — but Development Mode caps you at **five users**. You can't grow from 5 to 250,000 through the API itself. Independent developers have named this exact problem in Spotify's own forums.

**Second-order product consequence:** discovery can't be built on Spotify's intelligence anymore (Audio Features and Recommendations are gone), so Circles builds discovery from its *own* social signal — what your circles play and react to — which is more defensible and on-brand anyway.

**How Circles is designed to survive it:**
1. **Two-plane architecture** — Spotify is a read-only, swappable provider; product value lives in the layer we own.
2. **Provider abstraction** — the music layer can add Apple Music / YouTube Music, broadening the market beyond Spotify users.
3. **Own the discovery signal** — ranking from social engagement, not deprecated endpoints — turning a constraint into a moat.
4. **Sequence the business case** — treat the 5-user cap as a closed-beta budget; build the standalone identity and MAU via web/PWA distribution; approach Spotify's Extended Quota / partnership process from demonstrated, on-strategy traction (Circles drives the discovery and engagement Spotify says it wants).

**The honest version:** the platform dependency is genuinely existential. The right answer isn't to pretend it away — it's to keep the dependency shallow, build the moat in the layer you own, and frame Spotify as a partner.

---

## 10. MVP validation plan

Validate demand cheaply before scaling: a **fake-door / shadow button** to measure share intent; an **explainer landing page** with email capture; a **concierge closed beta** that uses the 5-user cap as a feature, watching whether the share→react→reply loop actually recurs; and **Wizard-of-Oz circles** to test whether private-group sharing drives more posting than public sharing. The decision gate from validate → scale is **behavioural retention**, not signup volume.

---

## 11. Risks & open questions

- **Platform dependency (section 9)** — highest severity; mitigated by architecture, ultimately needs a Spotify partnership.
- **Cold-start / empty feed** — a social app is worthless solo; mitigated by seeding via small friend-group circles and making the app valuable to lurkers.
- **Supply-side dependence on curators** — if Jasons don't post, others have nothing to react to; over-reward early sharing.
- **Open questions:** Does private-circle sharing out-perform public on posting volume? What's the right default audience in the composer? How much does live now-playing matter vs. manual sharing?

---

## 12. Phasing

- **Phase 0 — Validate.** Fake-door + landing + concierge beta within the 5-user cap. Gate on retention.
- **Phase 1 — MVP (this repo).** Connect, share, react/reply, circles, search, auto-share on the two-plane architecture.
- **Phase 2 — Network.** Discovery from social signal, richer profiles, provider abstraction groundwork.
- **Phase 3 — Scale & partner.** Second music provider; formal Extended Quota / partnership conversation with Spotify backed by traction.

---

*See the repository `README.md` for setup and how anyone can run their own instance.*
