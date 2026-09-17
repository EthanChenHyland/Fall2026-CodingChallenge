# Mosaic API

In development, Vite and Express run separately and Vite proxies `/api` to Express. In production, the Express process also serves the built React application.

## Authentication

- `POST /api/auth/register` — create an account and session.
- `POST /api/auth/login` — sign in and set an HTTP-only session cookie.
- `POST /api/auth/demo` — enter the seeded reviewer account without setup.
- `POST /api/auth/logout` — revoke the current session.
- `GET /api/auth/me` — return the signed-in account.

## Discovery

- `GET /api/search?q=<query>&page=<number>` — paginated image search.
- `GET /api/explore?page=<number>` — paginated public Mosaic pins.

Search uses Pixabay when `PIXABAY_API_KEY` is configured. Otherwise Mosaic searches Wikimedia Commons. A bundled catalog is the final reliability fallback.

## Profiles and follows

- `GET /api/profiles/:id` — public profile, stats, follow state, and public collections.
- `PATCH /api/profiles/me` — edit the signed-in profile.
- `POST /api/profiles/:id/follow` — follow an account.
- `DELETE /api/profiles/:id/follow` — unfollow an account.

## Collections

- `GET /api/collections` — list collections the current account owns or edits.
- `POST /api/collections` — create a collection owned by the current account.
- `GET /api/collections/:id` — get a collection, items, activity, and collaborators.
- `PATCH /api/collections/:id` — edit collection metadata; only owners can change visibility.
- `DELETE /api/collections/:id` — owner-only collection deletion.
- `POST /api/collections/:id/items` — save an image or manually added pin.
- `PATCH /api/collections/:id/items/:itemId` — edit title/note or persisted Canvas position.
- `DELETE /api/collections/:id/items/:itemId` — remove a saved image.

Duplicate source IDs are rejected within the same collection to prevent accidental repeat saves.

## Pin pages and social actions

- `GET /api/pins/:id` — retrieve a public pin, or a private pin when the signed-in user is a collection member.
- `POST /api/pins/:id/like` — like a public pin.
- `DELETE /api/pins/:id/like` — remove the current user's like.
- `GET /api/pins/:id/comments` — list comments on a public pin.
- `POST /api/pins/:id/comments` — comment on a public pin; the curator receives a notification.

## Sharing and collaboration

- `POST /api/collections/:id/share` — owner-only public read-only link creation.
- `DELETE /api/collections/:id/share` — revoke the public link and return the collection to private.
- `GET /api/shared/:token` — public read-only collection payload.
- `POST /api/collections/:id/collaborators` — add an existing Mosaic account as an editor.
- `DELETE /api/collections/:id/collaborators/:userId` — owner-only collaborator removal.

## Notifications

- `GET /api/notifications` — recent shared-collection and comment activity for the signed-in account.
- `POST /api/notifications/read` — mark current notifications read.

All private collection routes require a valid session and membership. Editors may change saved content and Canvas placement. Owner-only actions include deletion, public sharing, visibility, and collaborator management.
