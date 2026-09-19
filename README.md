# Mosaic

**Change++ Fall 2026 Coding Challenge**

**Name:** Ethan B. Chen

**Email:** ethan.b.chen@vanderbilt.edu

Mosaic is a Pinterest-style social discovery app for finding, saving, organizing, discussing, and sharing visual content. The challenge asked for the core search/save/share workflow; Mosaic extends that into profiles, follows, recommendations, collaborative collections, direct messages, threaded comments, privacy controls, presentation views, and a freeform Canvas.

**Live:** https://mosaic-f33m.onrender.com/

**Demo account**

```text
demo@mosaic.local
demo1234
```

The demo database is persistent and is not reset on every restart.

| Documentation | What is there |
| --- | --- |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Full product and system design, tradeoffs, reliability, deployment, providers, and major feature flows |
| [backend/API.md](backend/API.md) | REST API reference and endpoint behavior |
| [original_challenge.md](original_challenge.md) | Original prompt and scoring rubric |
| [README.txt](README.txt) | Required submission-format README |

## What to try

- **Discover:** search Pixabay/Wikimedia, use autocomplete and saved/recent searches, optionally expand typed searches with a lightweight AI helper, shuffle broad visual discovery, and save with Quick Save.
- **Organize:** create collections and sections, tag/filter pins, reorder them, use bulk actions, customize covers/themes/layouts, or switch to the draggable Canvas.
- **Share:** publish revocable links, invite editors, copy public boards, present a collection full-screen, and view first-party share counts.
- **Social:** follow people or collections, browse For You / Following / Trending, like and discuss pins, send pins through Messages, and use mentions/notifications.
- **Privacy/reliability:** private, followers-only, and public visibility; permission checks; undo/recovery; provider fallbacks; rate limiting; XSS protections; responsive mobile layouts; reduced motion; and keyboard support.

Mosaic deliberately puts complexity into product behavior people can actually use rather than making one showcase subsystem carry the whole submission. The optional AI search helper is intentionally narrow: one model call can improve related search phrasing without turning discovery into an agent or making the product depend on AI. The architecture notes explain where I chose simplicity and where I chose to spend complexity instead.

## Run locally

Requirements: **Node.js 20.19+ or 22.12+** and **npm**.

```bash
npm ci
npm run dev
```

The frontend normally runs at `http://127.0.0.1:5173`; the Express API runs at `http://127.0.0.1:3001`.

No API key is required. Optional integrations are documented in `.env.example`:

```text
PIXABAY_API_KEY=
OPENROUTER_API_KEY=
OPENROUTER_MODEL=google/gemini-2.5-flash-lite
VITE_CLOUDINARY_CLOUD_NAME=
VITE_CLOUDINARY_UPLOAD_PRESET=
RESEND_API_KEY=
EMAIL_FROM=
```

`OPENROUTER_API_KEY` enables AI-expanded related searches. It is intentionally a small search helper rather than an agent: Mosaic sends the typed query plus public catalog terms, keeps private/saved collection data in the local recommendation engine, and falls back to the existing Pixabay/database suggestions if OpenRouter is unavailable.

Production runs as one Docker service on **Render** with a persistent `/data` volume for SQLite and locally persisted media.

Useful checks:

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run test:e2e
```

## Reflection

This challenge pushed me past basic CRUD into permissions, collaboration, optimistic UI, rollback behavior, responsive design, and a lot of edge cases. I reinforced React, TypeScript, Express, REST APIs, and database modeling, but the biggest lesson was that polish comes from making many small states behave well together. The hardest part was connecting sharing, ownership, notifications, social features, and recovery without making the app feel messy. I also got better at deciding when extra complexity solves a real problem instead of merely making an architecture diagram look more impressive.

## Feedback

I liked that the prompt was open-ended while the baseline requirements stayed clear. That made it possible to choose an architecture intentionally and spend time on both engineering reliability and product design. A little more guidance on how reviewers weigh feature depth, polish, and architecture tradeoffs would make future submissions easier to scope.
