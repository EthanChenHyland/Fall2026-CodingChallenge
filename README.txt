MOSAIC — CHANGE++ FALL 2026 CODING CHALLENGE

Full Name: Ethan B. Chen
Vanderbilt Email: ethan.b.chen@vanderbilt.edu

Mosaic is a Pinterest-style social discovery app for finding, previewing, saving, organizing, discussing, and sharing visual content. It satisfies the required search/save/edit/remove/share flow and extends it with accounts, profiles, follows, recommendations, collaboration, direct messages, comments, sections, bulk organization, privacy controls, presentation views, import/export, a draggable Canvas, mobile navigation, and reliability/security work around those features.

LIVE APP
https://mosaic-f33m.onrender.com/

DEMO LOGIN
Email: demo@mosaic.local
Password: demo1234

The seeded demo database is persistent and is not reset on every restart. The production demo account is protected from deletion.

FAST REVIEW PATH
1. Sign in with the demo account or create an account.
2. In Discover, type from the first character to see suggestions, try result/orientation/order filters, save a search, open an in-site image preview, and save a pin.
3. Click the Mosaic brand while already in Discover to reset search/filter state and return to the top.
4. Open a collection, create a Section, edit/reorder pins, try bulk organize/copy/delete, then switch to Canvas.
5. Change the cover/theme/layout; try Import/Export, Activity, Present, and Share/privacy controls.
6. Open Explore and try For You / Following / Trending, public-pin previews, featured public collections, recommendation feedback, multi-select saving, web image filters, infinite provider discovery, and Shuffle.
7. Open a public pin to Like, inspect who liked it, Comment/Reply/@mention, Follow its collection, Send it through Messages, or Report it.
8. Visit another profile to follow/message them, inspect followers/following, or follow one of their public collections.
9. Try the Quick actions menu and command palette (Cmd+K on macOS or Ctrl+K on Windows/Linux). Mobile has the same actions through the compact shell.

CORE PRODUCT FEATURES
- Discover: live image search, autocomplete, recent/saved searches, AI-assisted related phrases when configured, social search, filters, infinite browsing, in-site previews, and fast local shuffle.
- Explore: For You, Following, Trending, recommendation feedback, public collections, batch saves, and infinite Pixabay/web discovery.
- Collections: create/edit/delete, private/followers/public audiences, collaboration, sections, tags, smart views, pin ordering, bulk actions, undo, cover focus, themes/layouts, JSON import/export, presentation mode, and Canvas.
- Social: profiles/handles, user follows, collection follows, likes, threaded comments, replies, @mentions, notifications, reporting, provenance, and direct messages with pin attachments.
- Sharing: revocable read-only URLs, follower-only sharing, public presentation URLs, editor invite links, public-board copying, and owner-only view/visitor/copy analytics.
- Account: session auth, optional six-digit email verification, profile editing, sign out, expired-session recovery, and password-confirmed account deletion.
- Mobile/accessibility: 320px and 390px layout coverage, touch-friendly controls, skip links, keyboard navigation, focus behavior, reduced motion, back-to-top, responsive dialogs, and mobile quick actions.
- Reliability/security: SQLite transactions and rollback coverage, server-side authorization, privacy filtering, provider media persistence, retry/error states, rate limiting, CSP/Helmet, URL validation, XSS regression coverage, and safe share analytics.

RUN LOCALLY
Requirements: Node.js 20.19+ or 22.12+, npm

From the repository root:
  npm ci
  npm run dev

Frontend: http://127.0.0.1:5173
API:      http://127.0.0.1:3001

No API key is required for local use. Wikimedia Commons and the bundled catalog provide fallbacks when Pixabay is not configured.

OPTIONAL ENVIRONMENT CONFIGURATION
Copy .env.example to .env if you want optional integrations.

  PIXABAY_API_KEY               preferred live image provider
  OPENROUTER_API_KEY            AI-assisted suggested/related visual-search phrases
  OPENROUTER_MODEL              defaults to google/gemini-2.5-flash-lite
  VITE_CLOUDINARY_CLOUD_NAME    direct browser uploads
  VITE_CLOUDINARY_UPLOAD_PRESET unsigned restricted upload preset
  RESEND_API_KEY                signup verification email
  EMAIL_FROM                    verified sender for signup verification
  DATABASE_PATH                 optional SQLite location override
  PORT / HOST                   server binding
  TRUST_PROXY_HOPS              reverse-proxy trust count; Render uses 1

The AI helper is intentionally narrow and optional. Search, recommendations, and the core product still work without OpenRouter.

PRODUCTION
Production runs as one Docker/Render service. Express serves both the REST API and compiled React app. Render mounts /data for SQLite and locally persisted provider media. This storage model assumes one application instance; horizontal scaling would require shared database/media infrastructure.

Pixabay Shuffle is designed to stay responsive without provider spam: every click reshuffles the already-loaded results immediately, while provider-backed refreshes are limited to a 10-second cooldown. Infinite scrolling remains available in Discover and the web-discovery sections of Explore/Trending.

DOCUMENTATION
docs/ARCHITECTURE.md — product/system design, tradeoffs, reliability, security, deployment, and feature flows
backend/API.md       — complete REST endpoint reference
frontend/README.md   — frontend architecture, routes, state, UI behavior, and development notes
backend/README.md    — backend architecture, persistence, integrations, security, and operations
original_challenge.md — original prompt and scoring rubric

VALIDATION
From the repository root:
  npm run typecheck
  npm run lint
  npm test
  npm run build
  npm run test:e2e

The Playwright suite covers the reviewer path plus 320px/390px mobile behavior, search suggestions, Discover reset, quick actions/command palette, reduced motion, imports, sharing, reporting, offline recovery, Pixabay pagination/shuffle throttling, and other cross-feature regressions. Backend tests cover routes, permissions/privacy, media, providers, transactions, collaboration, social features, and failure rollback.

DESIGN NOTE
I tried to put complexity where a reviewer can actually feel it: saving, organization, collaboration, privacy, social behavior, recovery, mobile behavior, and Canvas. Mosaic uses one deliberately narrow model call to improve suggested and related search phrasing, while personalization/ranking and fallbacks remain local. I avoided making the main product depend on an agent or model service. The architecture document explains those tradeoffs in detail.

KNOWN LIMITS
- SQLite/local media is intentionally single-instance in production.
- Collaboration is not live multiplayer; changes use normal API writes and refetches.
- Offline writes fail clearly instead of being queued for later conflict resolution.
- Live discovery quality/availability still depends on external providers when enabled.
- The welcome Three.js experience adds a relatively large lazy-loaded chunk.

REFLECTION (under 100 words)
This challenge pushed me past basic CRUD into permissions, collaboration, optimistic UI, rollback behavior, responsive design, and a lot of edge cases. I reinforced React, TypeScript, Express, REST APIs, and database modeling, but the biggest lesson was that polish comes from making many small states behave well together. The hardest part was connecting sharing, ownership, notifications, social features, and recovery without making the app feel messy. I also got better at deciding when extra complexity solves a real problem instead of merely making an architecture diagram look more impressive.

FEEDBACK
I liked that the prompt was open-ended while the baseline requirements stayed clear. That gave me room to choose an architecture intentionally and spend time on both engineering reliability and product design. A little more guidance on how reviewers weigh feature depth, polish, and architecture tradeoffs would make future submissions easier to scope.

SUBMISSION REMINDER
The original challenge also requires the Change++ completion form after the repository is finished. The form link is preserved in original_challenge.md.
