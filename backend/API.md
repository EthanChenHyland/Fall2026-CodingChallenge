# Mosaic API

In development, Vite and Express run separately and Vite proxies `/api` to Express. In production, the Express process also serves the built React application.

## Authentication

- `POST /api/auth/register` — create an account and session.
- `POST /api/auth/login` — sign in and set an HTTP-only session cookie.
- `POST /api/auth/demo` — enter the seeded reviewer account without setup.
- `POST /api/auth/logout` — revoke the current session.
- `GET /api/auth/me` — return the signed-in account.

## Discovery

- `GET /api/search?q=<query>&page=<number>` — paginated live image search.
- `GET /api/search/recommendations?q=<query>` — personalized query suggestions plus public-pin recommendations derived from saved interests; query-scoped results stay relevant to the active search.
- `GET /api/search/social?q=<query>` — search Mosaic people and public collections.
- `GET /api/explore?page=<number>&mode=all|following|trending` — public Mosaic pins with chronological, social-graph, or engagement ranking.
- `GET /api/explore/recommended` — personalized public-pin recommendations derived from the signed-in user's saved titles, tags, and collections.

Search uses Pixabay when `PIXABAY_API_KEY` is configured. Otherwise Mosaic searches Wikimedia Commons. A bundled catalog is the final reliability fallback.

## Profiles and follows

- `GET /api/profiles/:id` — profile, stats, follow state, and collections visible to the requester (public plus follower-only when eligible).
- `PATCH /api/profiles/me` — edit the signed-in profile.
- `POST /api/profiles/:id/follow` — follow an account.
- `DELETE /api/profiles/:id/follow` — unfollow an account.

## Public pins

- `GET /api/pins/:id/saved-in` — show which editable collections already contain the public pin's source, for library-wide duplicate detection.
- `POST /api/pins/:id/save` — copy a currently public pin into one of the signed-in user's editable collections with an optional private note. Duplicate sources in the target collection return `409`.
- `GET /api/profiles/:id/connections?kind=followers|following` — browse a profile's social graph.

## Collections

- `GET /api/collections` — list collections the current account owns or edits.
- `POST /api/collections` — create a collection owned by the current account.
- `GET /api/collections/:id` — get a collection, items, activity, and collaborators.
- `PATCH /api/collections/:id` — edit collection metadata; only owners can change private/followers/public audience.
- `DELETE /api/collections/:id` — owner-only collection deletion.
- `POST /api/collections/:id/items` — save an image with optional note atomically; images require HTTPS or an existing local media URL. Pixabay images are copied to persistent media.
- `POST /api/collections/:id/items/restore` — restore `{itemId}` from a server-side deletion snapshot within 10 minutes, preserving social data and identity.
- `POST /api/collections/:id/sections` — create a named section inside a collection.
- `PATCH /api/collections/:id/sections/:sectionId` — rename a section.
- `DELETE /api/collections/:id/sections/:sectionId` — remove a section while keeping its pins as Unsorted.
- `POST /api/collections/:id/items/bulk` — delete, move, copy, or assign selected pins to a section. Copy creates new destination pins while preserving the originals.
- `PATCH /api/collections/:id/layout` — atomically update `{positions: [{itemId, x, y, rotation}]}` for member-owned pins.
- `POST /api/collections/:id/items/bulk` — transactionally delete or move selected item IDs.
- `GET /api/collections/smart/:view` — recent, popular, or unsorted views (up to 60 pins).
- `PATCH /api/collections/:id/items/:itemId` — edit title/note or persisted Canvas position.
- `DELETE /api/collections/:id/items/:itemId` — remove a saved image.

Duplicate source IDs are rejected within the same collection to prevent accidental repeat saves.

## Pin pages and social actions

- `GET /api/pins/:id` — retrieve a public pin, or a private pin when the signed-in user is a collection member.
- `GET /api/pins/:id/related` — related public pins, preferring the same collection and curator.
- `POST /api/pins/:id/like` — like a public pin.
- `DELETE /api/pins/:id/like` — remove the current user's like.
- `GET /api/pins/:id/comments` — list comments and reply relationships on a public pin.
- `POST /api/pins/:id/comments` — comment or reply on a public pin using optional `parentId`; replies notify their author and exact `@Name` mentions notify matching users.
- `DELETE /api/pins/:id/comments/:commentId` — comment author or collection owner moderation.

## Sharing and collaboration

- `POST /api/collections/:id/share` — owner-only public read-only link creation.
- `DELETE /api/collections/:id/share` — revoke the public link and return the collection to private.
- `GET /api/shared/:token` — read-only collection payload; follower-only links require a signed-in follower or collection member.
- `POST /api/collections/:id/collaborators` — add an existing Mosaic account as an editor.
- `DELETE /api/collections/:id/collaborators/:userId` — owner-only collaborator removal.

## Notifications

- `GET /api/notifications` — recent collaboration, follow, like, and comment activity for the signed-in account.
- `POST /api/notifications/read` — mark current notifications read.

## Direct messages

- `GET /api/messages` — list the signed-in user's one-to-one conversations, latest message preview, and unread count.
- `POST /api/messages/with/:userId` — create or resume a conversation with another Mosaic account.
- `GET /api/messages/:id` — load a conversation and its persisted message history; participants only.
- `POST /api/messages/:id` — send a message up to 1,200 characters; participants only. An optional `pinId` may attach a currently public pin, which is returned with title/image metadata for a tappable conversation preview.
- `POST /api/messages/:id/read` — mark incoming messages in the conversation as read.

All private collection routes require a valid session and membership. Editors may change saved content and Canvas placement. Owner-only actions include deletion, public sharing, visibility, and collaborator management.

## Operations

- `GET /api/health` — readiness check that verifies SQLite and reports the active search provider.

Production responses use Helmet security headers, compression, API rate limiting, and same-origin CORS. The process handles SIGTERM/SIGINT for graceful container shutdown.
