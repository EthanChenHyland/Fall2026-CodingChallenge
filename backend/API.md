# Mosaic API

The frontend and API run as separate processes. Development requests under `/api` are proxied from Vite to Express.

## Authentication

- `POST /api/auth/register` — create an account and session.
- `POST /api/auth/login` — sign in and set an HTTP-only session cookie.
- `POST /api/auth/demo` — enter the seeded reviewer account without setup.
- `POST /api/auth/logout` — revoke the current session.
- `GET /api/auth/me` — return the signed-in account.

## Discovery and collections

- `GET /api/search?q=` — search the image catalog.
- `GET /api/collections` — list collections the current account owns or edits.
- `POST /api/collections` — create a collection owned by the current account.
- `GET /api/collections/:id` — get a collection, items, activity, and collaborators.
- `PATCH /api/collections/:id` — edit collection metadata; only owners can change visibility.
- `DELETE /api/collections/:id` — owner-only collection deletion.

## Saved images

- `POST /api/collections/:id/items` — save an image to an owned/shared collection.
- `PATCH /api/collections/:id/items/:itemId` — edit title/note or persisted Canvas position.
- `DELETE /api/collections/:id/items/:itemId` — remove a saved image.

## Sharing and collaboration

- `POST /api/collections/:id/share` — owner-only public read-only link creation.
- `DELETE /api/collections/:id/share` — revoke the public link and return the collection to private.
- `GET /api/shared/:token` — public read-only collection payload.
- `POST /api/collections/:id/collaborators` — add an existing Mosaic account as an editor.
- `DELETE /api/collections/:id/collaborators/:userId` — owner-only collaborator removal.

## Notifications

- `GET /api/notifications` — recent changes to collections shared with the signed-in account.
- `POST /api/notifications/read` — mark current notifications read.

All private collection routes require a valid session and membership. Editor accounts may change saved content and Canvas placement; owner-only actions include deletion, public sharing, visibility, and collaborator management.
