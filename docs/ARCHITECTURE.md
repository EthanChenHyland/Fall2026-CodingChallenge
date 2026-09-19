# Mosaic architecture and product design

This document contains the detail that would make the short root `README.txt` too slow to scan. `README.txt` is the reviewer landing page; this is the longer explanation of how Mosaic is built, why the major choices were made, and where the product goes beyond the Change++ baseline.

## Product shape

The required loop is simple: discover an image, save it into a collection, edit/remove it, and share the collection. Mosaic keeps that loop at the center, then builds outward from it instead of treating extensions as isolated demos.

The main surfaces are:

- **Discover** for provider-backed image search, autocomplete, recent/saved searches, result filters, recommendation feedback, and broad shuffleable browsing.
- **Explore** for Mosaic's public social feed, recommendation-driven discovery, Following/Trending views, multi-select saving, and a separate live provider-discovery section.
- **Collections** for normal boards, smart views, sections, tags, filtering, bulk actions, ordering, undo, covers, themes, layouts, import/export, presentation mode, and Canvas.
- **Pin detail** for source context, saving, likes, threaded comments/replies, mentions, sharing, messaging, reporting, and collection-order navigation.
- **Profiles** for public identity, avatars, follower/following state, collection follows, visible collections, and messaging.
- **Messages and notifications** for direct conversations, pin attachments, unread state, mentions/replies, collaboration activity, and social events.

The intent is that the extra features feed back into the original save → organize → share loop. A public pin can become a saved pin; a message can become a saved pin; a recommendation can become a collection item; a public collection can become a private copy; a discussion can remain attached to the content that caused it.

## Architecture at a glance

### Frontend

- React + TypeScript
- Vite
- TanStack Query for server state and cache/refetch behavior
- React Router
- Radix UI primitives where dialogs/tabs need robust interaction behavior
- Lucide icons
- Hand-written CSS for the application shell and product UI
- Three.js only for the ambient welcome experience

### Backend

- Node.js + Express REST API
- Route, middleware, and library modules kept separate
- SQLite with WAL mode, foreign keys, indexes, transactions, and ownership/membership constraints
- Session-based authentication with server-enforced authorization
- One production process serves both the REST API and compiled frontend

### Production

- Docker build/runtime
- Render web service
- Persistent `/data` disk for SQLite and locally persisted provider media
- Single application instance by design; this SQLite/local-media deployment is not intended for horizontal multi-instance writes

The API remains a normal REST boundary even though production serves the built frontend from the same Node process. Development keeps frontend and backend on separate ports.

## Why SQLite

SQLite is intentional here, not a stand-in for localStorage. Mosaic is deployed as one application instance and benefits from a relational database with foreign keys, uniqueness constraints, transactions, rollback behavior, and a very small operational footprint.

For this deployment shape, moving to PostgreSQL would add another managed service without changing the user experience. If Mosaic needed horizontal scaling, multiple write instances, or distributed media storage, PostgreSQL plus object storage would be the obvious next step.

This is also representative of the broader architecture philosophy: advanced infrastructure is useful when the product needs it. I did not want the submission to depend on one agent, model call, vector index, microservice, or rendering trick carrying the entire technical story. Those can be good solutions; they are not automatically good product decisions. Mosaic spends its complexity budget on permissions, collaboration, recovery, organization, media persistence, and the many states users actually touch.

## Discovery and external providers

Mosaic can run without paid APIs.

### Pixabay

When `PIXABAY_API_KEY` is configured, Pixabay is the preferred live provider. Typed search stays query-driven and preserves Pixabay's relevance ordering. Unfiltered discovery intentionally behaves differently: each browse page combines a recent all-image pool with two rotating visual themes (for example digital art + cars, anime illustration + interiors, space + street photography, or gaming + travel). Mosaic then shuffles within those groups and round-robins between them, so even the first few cards stay varied instead of merely shuffling a potentially homogeneous provider page.

If `OPENROUTER_API_KEY` is configured, typed autocomplete/related-search requests ask a small language model for closely related visual phrases. The homepage Suggested for you row can use the same model with a generic visual-inspiration prompt and public catalog context; private boards, saved-item metadata, and profile data stay in Mosaic's local recommendation path, where they still influence final ranking. Results are cached briefly, bounded by a short timeout, and optional: provider/database suggestions remain the fallback whenever OpenRouter is missing or unavailable. This is a search enhancement, not an autonomous agent.

The ten logical browse pages rotate through twenty themes spanning art, cars, anime-style illustration, interiors, fashion, food, animals, architecture, space, street photography, gaming, travel, science, sports, music, technology, fantasy art, transportation, people, and abstract art. The general pool remains in every batch so the feed can still surface genuinely unexpected recent uploads rather than becoming a fixed category menu.

Provider responses are cached in SQLite and guarded against excessive requests. When a Pixabay result is saved, Mosaic downloads and validates a durable local copy instead of depending forever on the provider's temporary delivery URL.

### Wikimedia Commons

Wikimedia provides a keyless live fallback so image search still works without a Pixabay key or when Pixabay is unavailable. Source/attribution links remain available.

### Local catalog

A bundled local catalog gives the app one more fallback path so basic discovery is not coupled to a provider being healthy.

## Recommendations without a model dependency

Mosaic recommendations use application signals that already exist: saved interests, follows/social context, popularity, and explicit **More like this / Not interested** feedback.

That gives the product personalized behavior without requiring a model API just to run the app. The important decision here is not that model-backed recommendations are bad; it is that Mosaic's current problem can be solved from first-party product signals with lower setup, latency, and failure surface.

Search recommendations and Explore recommendations remain separate from provider-backed image discovery so broad browsing can stay varied while typed search stays relevant.

## Collections and organization

Collections are the center of the application. Beyond the baseline create/save/remove flow, they support:

- descriptions and custom covers
- cover crop/focus
- themes
- multiple layouts
- sections
- tags and filtering
- smart collection views
- bulk move/copy/delete
- multi-select saving from Explore
- persistent drag/keyboard ordering
- undo after deletion
- portable JSON export/import
- full-screen presentation mode

Deleting and undoing are designed around identity preservation rather than recreating a superficially similar pin. Related state such as discussion and cover references is protected through the undo window.

## Canvas

Canvas is the most visual collection mode. Saved pins can be arranged freely, dragged, keyboard-nudged, aligned with guides, and rearranged with Remix/Tidy controls. Positions persist.

Canvas is deliberately DOM/CSS rather than WebGL. The pins are still application UI: they need semantic content, normal focus behavior, selection, menus, keyboard control, responsive behavior, and predictable testing. A shader-heavy canvas would be more technically exotic while making those product requirements harder.

Three.js stays where it adds atmosphere without becoming infrastructure: the welcome experience.

## Sharing, visibility, and collaboration

Collections support three visibility levels:

- **Private** — visible only to members with access.
- **Followers-only** — public enough for the owner's followers, but not globally exposed.
- **Public** — available through the public product and share flows.

Public sharing uses revocable links. Presentation links remain read-only. Signed-in users can copy a public board into a new private collection while preserving safe organization data such as sections/layout/cover choices and provenance.

Collaboration is account-based and role-scoped. Owners can add editors or create revocable editor invite links. Editor permissions are intentionally narrower than owner permissions, and removed collaborators lose access.

Mosaic does not pretend to be real-time multiplayer. Collaboration uses normal API writes/refetch/navigation rather than WebSocket presence or operational transforms. For this challenge, correctness and permission boundaries mattered more than adding live cursors.

## Social layer

The social system is tied to saved content rather than existing as a separate feed demo.

It includes:

- public profiles and handles
- user follows
- collection follows
- For You / Following / Trending Explore modes
- likes
- threaded comments
- replies and @mentions
- notifications and activity history
- direct messages
- pin attachments in messages
- saving a received/shared pin
- privacy-safe repin provenance
- public-content reporting

Collection follows and user follows are distinct signals. Provenance is preserved where useful but filtered so a repin cannot reveal a board that later becomes private.

## Authentication and authorization

Authentication is session-based. Authorization is enforced on the server, not inferred from what the frontend happens to hide.

Important permission boundaries include:

- collection owner vs editor/member behavior
- private/followers-only/public reads
- collaborator add/remove/invite flows
- public share links vs edit access
- owner-only operations such as destructive collection controls
- direct-message privacy
- account deletion and reauthentication

The seeded demo account is protected from deletion so reviewers cannot accidentally remove the shared review path.

## Reliability and data integrity

Several parts of the project are intentionally less visible than the feature list.

### Transactions and rollback

Writes that span related records use transactions where partial state would be dangerous. Tests deliberately force failures in activity/notification/session writes to verify that the primary mutation rolls back rather than leaving inconsistent data.

Examples include collaboration membership changes, pin saves, social mutations, and account/session creation.

### Provider media

Downloaded provider media is validated before use and stored durably. Failed database saves clean up newly downloaded media rather than leaking orphan files. Media garbage collection preserves live and undo references.

Portable exports can embed locally stored provider media so importing later does not silently recreate broken external references.

### Privacy filtering

Counts, provenance, membership, and public data are filtered so private state is not inferred through an adjacent feature. Removing access takes effect across collection reads and related flows.

### Error states

The UI includes retryable failures, saving feedback, loading skeletons, empty states, expired-session recovery, and explicit offline/write failure rather than pretending an action succeeded.

## Uploads and email

### Cloudinary

Cloudinary is optional for direct browser uploads. The frontend only needs the cloud name and a restricted unsigned upload preset. The API secret must never be placed in a `VITE_*` environment variable.

The intended preset restricts file types and size/dimension behavior. Local/provider media handling remains separate from Cloudinary-backed direct uploads.

### Resend

Resend is optional for six-digit signup verification. When email configuration is absent in local development, account creation can proceed without requiring an external mail service; when configured, the verification flow is enforced.

## Security posture

The project includes practical protections for the risks created by its feature set:

- server-side authorization and membership checks
- input validation
- URL/protocol validation
- restricted provider download hosts and redirect handling
- stored-content XSS regression coverage
- Helmet/CSP browser security headers
- session cookie handling
- sign-in throttling/rate limiting
- request-size limits
- safe handling for malformed cookies/JSON/pagination
- privacy filtering for public and social reads
- report deduplication per reporter/target

The goal is not security theater; the protections are aimed at actual attack surfaces created by uploads, provider downloads, public links, user-generated text, messaging, and account permissions.

## Share analytics

Owners get small first-party counts for public shares: views, unique visitors, and copies. Unique-view handling uses a random first-party visitor token that is hashed before storage; raw IP addresses are not stored for these counts.

The analytics stay intentionally narrow instead of turning Mosaic into a tracking system.

## Accessibility and responsive behavior

The application supports:

- keyboard navigation and visible focus behavior
- skip links and focusable main landmarks
- dialog accessibility semantics
- reduced-motion behavior
- touch-friendly mobile controls
- dedicated mobile navigation
- layout checks at 390px and 320px widths
- mobile recovery paths for dialogs/capture/offline states

The visual design is intentionally restrained inside the main product so interaction states remain legible. Motion is used for feedback and polish rather than as a prerequisite for understanding the interface.

## PWA and offline behavior

Mosaic can cache the application shell for installability. It does **not** cache private API responses or arbitrary third-party images as if they were safe public assets.

Offline writes fail clearly instead of being queued for later synchronization. That is a deliberate limit: reliable offline mutation sync would add conflict-resolution semantics that the project does not otherwise need.

Share-target behavior depends on browser/platform support.

## Deployment

Production is configured for **Render**. The repository includes a Dockerfile and `render.yaml`. Express serves the built frontend and REST API from one service, and Render mounts `/data` for the SQLite database and local media.

The service should remain a single instance with this storage model. If the project moved to horizontally scaled instances, the database and media layer would need to move to shared infrastructure first.

For backups, preserve both the SQLite database and `/data/media`. Use SQLite's online backup mechanism rather than assuming a copied open WAL file is a complete backup.

## Validation

The repository includes backend regression tests and a Playwright reviewer-flow suite. The release checks are:

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run test:e2e
```

Coverage includes authentication/session behavior, permissions/privacy, provider fallback and media persistence, transaction rollback, collaboration, social features, messaging, sharing, reporting, collection copies, analytics, stored XSS, responsive 390px/320px layouts, reduced motion, keyboard behavior, and end-to-end reviewer flows.

## Known limits and intentional non-features

- SQLite/local media assumes one production app instance.
- Collaboration is not live multiplayer.
- Offline writes are not queued for later reconciliation.
- Smart newest/top views intentionally cap their result sets.
- Provider quality/availability still depends on external services when using live discovery.
- The welcome Three.js chunk is relatively large, but it is isolated from the main application and not a reason to rewrite the product this late.

These are conscious boundaries, not hidden TODOs. The goal was to ship a cohesive, testable product rather than maximize the number of technologies in the diagram.

## API reference

See [../backend/API.md](../backend/API.md) for endpoint-level documentation.
