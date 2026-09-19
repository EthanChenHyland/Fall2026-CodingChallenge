# Mosaic API

Mosaic exposes a REST API under `/api`. In development, Vite and Express run separately and Vite proxies API requests to Express. In production, the Express process serves both the API and the compiled React application.

Authentication uses an HTTP-only session cookie. Routes described as authenticated return `401` when the session is missing or expired. Collection membership and owner checks are enforced server-side.

## Operations

- `GET /api/health` — readiness check for SQLite plus the active preferred search provider.
- Unknown `/api/*` routes return a JSON `404`.

## Authentication

- `POST /api/auth/register` — create an account immediately when email verification is not configured. Requires name, email, password, and `ageConfirmed: true`.
- `POST /api/auth/register/start` — canonical signup start. Creates the account immediately when verification is disabled, or sends a six-digit verification code when Resend is configured.
- `POST /api/auth/register/verify` — finish verified signup with email + six-digit code. Codes expire after 10 minutes and have an attempt limit.
- `POST /api/auth/login` — sign in and set the session cookie.
- `POST /api/auth/demo` — enter the seeded demo account in non-production environments only.
- `POST /api/auth/logout` — revoke the current session.
- `GET /api/auth/me` — authenticated current-account lookup.
- `DELETE /api/auth/account` — authenticated permanent account deletion after password + `DELETE` confirmation. Seeded demo accounts are protected.

## Search and discovery

- `GET /api/search?q=<query>&page=<n>&source=<provider>&seed=<n>` — paginated provider-backed image search/browse. `source=wikimedia` can force Wikimedia; otherwise Pixabay is preferred when configured. Empty-query Pixabay browsing uses a seed for varied logical pages.
- `GET /api/search/recommendations?q=<query>` — suggested/related search phrases plus locally ranked public pins. OpenRouter can add AI-assisted phrases when configured; failures fall back to local/provider/database suggestions.
- `GET /api/search/social?q=<query>` — search Mosaic people and public collections.
- `GET /api/explore?page=<n>&mode=all|following|trending` — public Mosaic pins. Following uses user/collection follows; Trending weights engagement.
- `GET /api/explore/recommended` — personalized public-pin recommendations from saved interests and explicit recommendation feedback.
- `GET /api/explore/collections` — featured public collections ranked by followers and recency.

Search fallback order is Pixabay when configured, Wikimedia Commons when needed, then the bundled catalog where applicable. Provider results are cached. Saved Pixabay media is persisted locally instead of relying permanently on provider delivery URLs.

## Profiles and follows

- `GET /api/profiles/:identifier` — public profile by username or numeric ID, stats, follow state, and collections visible to the requester.
- `PATCH /api/profiles/me` — authenticated profile edit for name, bio, and avatar URL.
- `GET /api/profiles/:id/connections?kind=followers|following` — follower/following list with viewer follow state.
- `POST /api/profiles/:id/follow` — authenticated follow.
- `DELETE /api/profiles/:id/follow` — authenticated unfollow.

Follower-only collections are shown only to eligible viewers.

## Collections

All collection routes require authentication.

### Collection lifecycle

- `GET /api/collections` — collections the current account owns or edits.
- `POST /api/collections` — create a collection.
- `GET /api/collections/smart/:view` — `recent`, `popular`, or `unsorted` smart view.
- `GET /api/collections/:id` — member-only collection detail, items, collaborators, and activity.
- `PATCH /api/collections/:id` — update metadata, cover, theme/layout, and audience where allowed. Audience/visibility changes are owner-only.
- `DELETE /api/collections/:id` — owner-only collection deletion.
- `GET /api/collections/:id/export` — portable Mosaic JSON export with board metadata, sections, notes/tags, Canvas placement, cover choice, and eligible embedded local media.
- `POST /api/collections/import` — import a supported Mosaic export into a new private collection owned by the current user.
- `POST /api/collections/:id/clone` — copy a currently public shared collection into a new private collection while preserving safe organization/provenance data.
- `GET /api/collections/:id/share-analytics` — owner-only views, unique visitors, and copies for the collection's share flow.

### Sections, ordering, and items

- `POST /api/collections/:id/sections` — create a section.
- `PATCH /api/collections/:id/sections/:sectionId` — rename a section.
- `DELETE /api/collections/:id/sections/:sectionId` — delete a section while keeping its pins unsorted.
- `PATCH /api/collections/:id/sections-order` — persist section ordering.
- `PATCH /api/collections/:id/items/order` — persist pin ordering.
- `POST /api/collections/:id/items` — save an image with title/source/note/tags. HTTPS or existing local-media URLs are required; Pixabay media is persisted locally.
- `PATCH /api/collections/:id/items/:itemId` — edit title/note/tags or Canvas position/rotation.
- `DELETE /api/collections/:id/items/:itemId` — remove a pin and create a temporary undo snapshot.
- `POST /api/collections/:id/items/restore` — restore `{ itemId }` during the undo window while preserving identity/social data.
- `PATCH /api/collections/:id/layout` — atomically update Canvas positions.
- `POST /api/collections/:id/items/bulk` — transactionally delete, move, copy, or section selected pins.

Duplicate source IDs are rejected within the same collection.

### Sharing, audience, follows, and collaboration

- `POST /api/collections/:id/share` — owner-only creation of a revocable public read-only share token.
- `DELETE /api/collections/:id/share` — owner-only share revocation and return to private.
- `POST /api/collections/:id/follow` — follow a public collection.
- `DELETE /api/collections/:id/follow` — unfollow a collection.
- `GET /api/collections/:id/editor-invite` — owner-only current editor-invite status.
- `POST /api/collections/:id/editor-invite` — owner-only create/regenerate editor invite.
- `DELETE /api/collections/:id/editor-invite` — owner-only revoke editor invite.
- `GET /api/collections/editor-invites/:token` — authenticated invite preview.
- `POST /api/collections/editor-invites/:token/accept` — authenticated invite acceptance.
- `POST /api/collections/:id/collaborators` — owner-only add an existing account by email as editor.
- `DELETE /api/collections/:id/collaborators/me` — leave a collection as an editor.
- `DELETE /api/collections/:id/collaborators/:userId` — owner-only collaborator removal.

Editors can modify saved content and Canvas placement. Owner-only controls include deletion, sharing/audience changes, collaborator management, and share analytics.

## Public shared collections

- `GET /api/shared/:token` — read-only shared collection payload. Public links are anonymous; follower-only links require the owner, a collection member, or an eligible signed-in follower.

Share views are recorded with a random first-party visitor token hashed before storage. Raw IP addresses are not stored for share analytics.

## Public pins and social actions

- `GET /api/pins/:id` — pin detail when public, follower-visible, or accessible through membership; includes privacy-filtered provenance and collection-order navigation.
- `GET /api/pins/:id/related` — related public pins.
- `POST /api/pins/:id/recommendation-feedback` — authenticated `more` or `not_interested` signal.
- `GET /api/pins/:id/saved-in` — authenticated editable collections that already contain the same source.
- `POST /api/pins/:id/save` — authenticated copy of a public pin into an editable collection, with optional private note.
- `POST /api/pins/save-batch` — authenticated batch save of up to 30 public pins; duplicates are skipped and unavailable pins reported.
- `POST /api/pins/:id/like` — authenticated like.
- `DELETE /api/pins/:id/like` — authenticated unlike.
- `GET /api/pins/:id/likes` — accounts that liked a public pin.
- `GET /api/pins/:id/comments` — comments/replies plus deletion permission state.
- `POST /api/pins/:id/comments` — authenticated comment or reply. Replies and exact `@Name` mentions create notifications.
- `DELETE /api/pins/:id/comments/:commentId` — comment-author or collection-owner moderation.

Repin lineage is preserved across copies and undo, but private/unavailable boards are filtered from provenance returned to viewers.

## Notifications

Authenticated only.

- `GET /api/notifications` — recent collaboration, follow, like, reply/mention, and related activity filtered for current visibility.
- `POST /api/notifications/read` — mark current notifications read.

## Direct messages

Authenticated only.

- `GET /api/messages` — one-to-one conversations, latest preview, and unread count.
- `POST /api/messages/with/:userId` — create or resume a conversation.
- `GET /api/messages/:id` — participant-only conversation history.
- `POST /api/messages/:id` — send up to 1,200 characters and/or attach a currently public shareable pin.
- `POST /api/messages/:id/read` — mark incoming messages in the conversation read.

Pin attachments are privacy-checked again when conversations are loaded, so a pin that stops being public does not keep exposing its metadata.

## Reporting

- `POST /api/reports` — authenticated report of a public pin, profile, or public comment. Reasons: `spam`, `harassment`, `sexual`, `copyright`, or `other`; optional details are capped at 500 characters. Duplicate open reports from the same reporter/target return `409`.

## Production behavior

Production responses use Helmet/CSP headers, compression, API/request rate limiting, same-origin CORS rules, request-size limits, and graceful SIGTERM/SIGINT shutdown. Static provider media is served from `/media` with immutable caching.

See `../docs/ARCHITECTURE.md` for data-model, privacy, provider, deployment, and reliability details.
