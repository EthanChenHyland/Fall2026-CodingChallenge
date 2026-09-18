# Mosaic product goal

## North star

Mosaic should feel like a small consumer product that happens to satisfy the Change++ challenge, not a coding-challenge demo. The final handoff should be: connect the private repo to a host, add optional provider keys, attach persistent storage, and share the URL.

A first-time reviewer should be able to understand the product without instructions and complete the full loop in roughly two minutes: discover something, save it, organize it, make the board visual, publish or collaborate, explore another curator, and interact socially.

## Deploy-ready finish line

- [x] Zero-key baseline: Wikimedia Commons live search plus a bundled fallback catalog.
- [x] Optional provider upgrades: Pixabay search and Cloudinary uploads from environment variables.
- [x] Creation loop: web discovery, URL pins, file upload, PWA Quick Capture/share target.
- [x] Collection loop: create, rename, describe, save, edit, remove, search, sort, board sections, bulk move/copy/organize, privacy toggle, public link.
- [x] Signature interaction: persisted tactile Canvas with drag/keyboard movement plus one-click remix and tidy compositions.
- [x] Collaboration: account-based editors, scoped permissions, activity history, notifications, optimistic UI with rollback.
- [x] Social layer: public profiles, profile and collection follows, follower/following browser, private direct messages with unread state and public-pin previews, Pin → DM sharing, single and multi-select save-to-collection from public feeds with privacy-safe repin lineage, save from messages, For You/Following/Trending feeds with followed-board activity, personalized “Because you saved…” recommendations, follower-only collections, likes, threaded comment replies, @mentions, moderation, related pins.
- [x] Unified discovery: live image search plus Mosaic people and public collections.
- [x] Personalized search discovery: suggested queries before typing, related-search chips, interest-aware public-pin recommendations alongside search results, and persisted More like this / Not interested feedback that tunes future ranking.
- [x] Mobile/PWA: responsive shell, safe-area navigation, install manifest, offline shell, native share, incoming share target.
- [x] Production service: one Node process serves React + API; Docker image; persistent SQLite path; Render Blueprint.
- [x] Production safeguards: CSP/security headers, compression, rate limits, same-origin production API, graceful shutdown, readiness health check.
- [x] Quality gates: TypeScript, lint, backend regression tests, production build, whitespace checks.
- [x] Browser release gate: production build smoke-tested in Chrome on desktop and 390×844 mobile with no horizontal overflow.

## Product rules for future work

1. Add behavior a reviewer can see or reliability they can feel. Do not pad LOC or commit count.
2. Keep commits small enough to tell a believable development story, but large enough to represent a real change.
3. Preserve the restrained graphite / warm-neutral / blue product identity and the Canvas as Mosaic's signature differentiator.
4. Every new external dependency or provider must degrade gracefully when unavailable.
5. Private data stays private by default; public collections and social surfaces are explicit opt-ins.
6. Before calling a milestone done, run `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e`, and `git diff --check`.

## Post-challenge stretch, not required for deployment

Optional future directions that should only be added if they improve the product rather than the feature count: OAuth, richer comment replies, video pins, collection export/import, dynamic social-preview metadata, and a PostgreSQL storage adapter for multi-instance hosting.
