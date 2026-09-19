# Mosaic backend

The backend is a Node.js + Express + TypeScript REST API backed by SQLite. It handles authentication, authorization, discovery/provider integration, collections, collaboration, social features, messaging, media persistence, reporting, and production serving of the built frontend.

For reviewer-facing setup and the complete product summary, start with [../README.txt](../README.txt). For every route, see [API.md](API.md).

## Development

From the repository root:

```bash
npm ci
npm run dev
```

The API normally runs at `http://127.0.0.1:3001`.

Backend-only commands:

```bash
npm run dev -w backend
npm run typecheck -w backend
npm run test -w backend
npm run build -w backend
npm run start -w backend
```

## Structure

- `src/app.ts` — Express app, middleware, rate limits, health check, route mounts, production frontend/static handling
- `src/server.ts` — process startup/shutdown
- `src/db.ts` — schema, indexes, migrations/seed behavior
- `src/routes/` — auth, search, collections, explore, pins, profiles, notifications, messages, reports, shared links
- `src/middleware/` — authentication/authorization
- `src/lib/` — collection helpers, media persistence, provider logic, provenance, share analytics, AI search suggestions, URL validation, restore snapshots
- `test/` — backend regression tests

## Persistence and authorization

SQLite runs with relational constraints, indexes, transactions, and WAL behavior. The production deployment intentionally assumes one application instance with a persistent `/data` disk.

Authorization is enforced on the server. Important boundaries include:

- authenticated vs anonymous routes
- collection member/editor/owner roles
- private/followers/public audiences
- follower-only shared views
- owner-only destructive/share/collaborator controls
- message participant access
- public-pin/comment reporting visibility
- account deletion with password confirmation

The seeded reviewer account is protected from deletion.

## Search providers

Mosaic works without paid API keys.

1. Pixabay is preferred when `PIXABAY_API_KEY` is set.
2. Wikimedia Commons provides a keyless live fallback.
3. A bundled catalog supports additional fallback behavior.

Search/provider responses are cached. Empty-query Pixabay browsing deliberately mixes a general recent pool with rotating visual themes to keep discovery varied.

The frontend can locally reshuffle already-loaded Pixabay results on every click. Provider-backed Shuffle refreshes are limited to a 10-second client cooldown, while the backend also keeps provider request guards/caching.

## Optional AI discovery helper

`OPENROUTER_API_KEY` enables a narrow model call for suggested/related visual-search phrases. `OPENROUTER_MODEL` defaults to `google/gemini-2.5-flash-lite`.

The model is not required for image search, recommendations, ranking, authentication, collections, or any core app flow. Timeouts/failures fall back to local/provider/database suggestions.

## Media handling

When a Pixabay result is saved, the backend can persist and validate a local copy rather than depending forever on the provider URL. Media helpers also handle cleanup and portable export/import of eligible local assets.

Direct user uploads use Cloudinary from the browser when configured; the backend does not expose a Cloudinary API secret.

## Authentication and email verification

Sessions are server-side and use an HTTP-only cookie. Signup supports:

- direct local account creation when verification is not configured
- optional six-digit Resend verification when `RESEND_API_KEY` and `EMAIL_FROM` are set
- code expiration and attempt limits
- login/logout/session lookup
- password-confirmed account deletion

`POST /api/auth/demo` exists only outside production; production reviewers use the normal seeded demo credentials.

## Reliability and privacy

The backend includes:

- transactions around multi-record mutations
- rollback tests for failure cases
- server-side input validation with Zod
- privacy-filtered provenance and notifications
- revocable sharing/editor invites
- provider download validation and host restrictions
- duplicate-source checks
- restore snapshots for delete/undo
- first-party share analytics using hashed visitor tokens rather than stored raw IPs
- report deduplication
- graceful session expiry behavior

## Security and operations

Production uses Helmet/CSP, compression, API/login/report rate limiting, request-size limits, same-origin CORS behavior, cookie/session controls, URL/protocol validation, and graceful SIGTERM/SIGINT handling.

Environment variables are documented in [../.env.example](../.env.example):

- `PIXABAY_API_KEY`
- `OPENROUTER_API_KEY`
- `OPENROUTER_MODEL`
- `DATABASE_PATH`
- `PORT`
- `HOST`
- `TRUST_PROXY_HOPS`
- `RESEND_API_KEY`
- `EMAIL_FROM`
- frontend Cloudinary variables are also stored in the root environment

## Production

The Docker/Render production process serves:

- `/api/*` — REST API
- `/media/*` — validated locally persisted media
- the compiled React SPA, including share/pin metadata rendering for public links

Render mounts `/data` for SQLite and media. Backups need both the database and media directory. Horizontal multi-instance writes would require moving persistence to shared infrastructure.

## Validation

From the repository root:

```bash
npm run typecheck
npm test
npm run build
npm run test:e2e
```

Backend coverage includes authentication/session behavior, permissions/privacy, provider fallbacks and media persistence, collaboration, collection/social mutations, sharing, reporting, messaging, analytics, transaction rollback, and malformed/error cases.

See [../docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md) for the larger design rationale.
