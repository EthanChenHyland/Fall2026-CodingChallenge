MOSAIC — CHANGE++ FALL 2026 CODING CHALLENGE

Full Name: Ethan B. Chen
Vanderbilt Email: ethan.b.chen@vanderbilt.edu

LIVE DEPLOYMENT
https://mosaic-f33m.onrender.com/

WHAT I BUILT
Mosaic is a Pinterest-inspired image discovery, saving, organization, collaboration, and social curation app. The required challenge flow — search, create collections, save/edit/remove content, share by URL, and collaborate with accounts — is the foundation. I then pushed the project toward a fuller product rather than stopping at CRUD.

PRODUCT PHILOSOPHY
Mosaic deliberately prioritizes product depth over technical spectacle. I could have spent the challenge budget on a separate AI chat/agent service, an embeddings/vector-search stack, extra microservices, or a cinematic Three.js/WebGL landing experience simply to make the architecture look more sophisticated. I chose not to. None of those technologies is automatically valuable because it is harder to build; they are valuable only when they materially improve the user's job.

For this product, the harder and more useful problem was making the full save-organize-share loop feel complete: fast discovery, reliable persistence, collaboration, messaging, social interactions, bulk organization, responsive behavior, failure recovery, and a Canvas that people can actually manipulate. Mosaic is intended to be a product a user can keep using after the demo, not a collection of technically impressive side systems attached to a simpler core.

The app includes:
- Live image search with Pixabay when configured, Wikimedia fallback, pagination, related searches, and recommendation feedback.
- Accounts, profile handles, editable profiles/avatars, follows, collection follows, follower counts, and public profiles.
- Private, followers-only, and public collections; revocable public share links; account collaborators; and revocable editor invite links.
- Quick Save, multi-select Explore saving, duplicate protection, smart collections, sections, tags, filtering, bulk move/copy/delete, and undo.
- Grid, Gallery, Compact, Masonry, and a draggable Canvas with persisted positions, alignment guides, Remix/Tidy, undo, and redo.
- Likes, threaded comments, replies, @mentions, activity history, notifications, and privacy-safe repin provenance.
- Direct messages with unread state, optional text, attached pin previews, and saving a received pin into a collection.
- Custom collection covers/crops/themes, collection export/import, PWA install/share-target support, keyboard shortcuts, onboarding, and responsive mobile behavior.
- Optional Cloudinary uploads, Resend email verification, durable local copies of saved Pixabay media, rate limiting, CSP/security headers, and account deletion.

Core functionality does not depend on paid APIs. With no keys configured, Mosaic still runs using Wikimedia and local functionality.

DESIGN DIRECTION — PRODUCT UI OVER THREE.JS / AWWWARDS-STYLE EFFECTS
I considered a heavier WebGL/Three.js presentation, but chose not to make visual spectacle the center of Mosaic. The challenge is an image-saving/sharing product with repeated workflows: search, scan many images, save quickly, organize precisely, collaborate, and use the same interface on a phone. A 3D hero or shader-heavy transition would add bundle/runtime cost and motion complexity without improving those tasks.

That choice also matches the rubric: it rewards working features, maintainable code, responsive polish, collaboration, reliability, and creativity without prescribing a rendering technique. I treated “make the application look good” as a product-design requirement rather than a requirement to turn the app into a cinematic landing page.

For the same reason, I did not bolt on a separate AI-agent service, model-dependent chat layer, embedding pipeline, or microservice solely to increase the apparent sophistication of the stack. Those can be useful when they solve a real product problem, but here they would introduce credentials, latency, failure modes, and review/setup overhead without helping the core save-organize-share workflow. I would rather make the main product deeper, faster, and easier to run than add complexity that is impressive mostly in an architecture diagram or feature checklist.

I spent that complexity budget on interactions that remain useful after the first impression: a real draggable Canvas, multi-select organization, optimistic actions with recovery, responsive layouts, collection customization, social feedback, collaboration, and mobile/offline/error states. The visual language is intentionally closer to a polished consumer app than an Awwwards portfolio landing page. Motion is restrained so the content stays primary and the interface remains understandable, fast, keyboard-usable, and responsive.

The Canvas is also intentionally DOM/CSS based instead of WebGL. Pins need normal focus behavior, selection, text, menus, drag state, persisted coordinates, and reliable mobile interaction. Using ordinary interface primitives made those behaviors easier to keep accessible and testable while still giving collections a spatial mode.

ENGINEERING CHOICES
Frontend: React + TypeScript, Vite, TanStack Query, Radix UI primitives, Lucide icons, and hand-written CSS.
Backend: Node.js + Express REST API with separated route/middleware/library modules.
Database: SQLite in WAL mode with foreign keys, transactions, indexes, ownership/membership rules, and persistent production storage.
Production: one Docker service on Render; Express serves the compiled frontend and REST API, with a persistent /data volume.

SQLite was deliberate for this submission. Mosaic is deployed as one application instance, so an embedded transactional database keeps setup small, makes the repository easy to run, and still provides real persistence and rollback behavior. The code does not use localStorage as its database. If the product needed horizontal multi-instance scaling, the next infrastructure step would be moving the persistence layer to PostgreSQL/object storage rather than pretending the current deployment has that requirement.

Recommendations are similarly designed to degrade cleanly. Mosaic learns from saved interests, follows, popularity, and explicit More like this / Not interested feedback without requiring an AI key. I preferred a recommendation system that every reviewer can run over making the core experience depend on an external model service.

EXTERNAL SERVICES / INTEGRATIONS
- Render — production hosting, health checks, and persistent disk storage.
- Pixabay API — preferred live image discovery provider when an API key is configured.
- Wikimedia Commons — keyless live image-search fallback so discovery still works out of the box.
- Cloudinary — optional direct image uploads from the browser through a restricted unsigned upload preset.
- Resend — optional 6-digit signup verification email delivery.
- GitHub — source control and submission repository; Render deploys from the main branch.
- Docker — reproducible production build/runtime packaging.

These integrations are optional around the core app rather than hard dependencies. A reviewer can clone Mosaic, run npm ci + npm run dev, create an account, search, save, organize, share, and collaborate without configuring a paid AI/model service.

RELIABILITY / SECURITY DETAILS
- Database writes that span related records use transactions and rollback on failure.
- Delete/undo preserves pin identity and discussion during the undo window.
- Provider search is cached and rate guarded; downloaded provider media is validated and stored durably.
- Session cookies, CSP/Helmet headers, input validation, URL checks, login throttling, and stored-content XSS regression coverage are included.
- Seeded demo accounts are locked in production by default. A private reviewer password can be supplied through DEMO_ACCESS_PASSWORD without committing a credential.
- Production health checks report database and search-provider readiness.

QUICK REVIEW PATH
1. Create an account. With Resend unset locally, registration completes immediately; with Resend configured, Mosaic requires the 6-digit email code.
2. Search in Discover and save an image. Quick Save remembers the last collection; the adjacent menu lets you choose another.
3. Open Collections and try Recently saved / Most liked / Unsorted, then enter a normal collection.
4. Create a Section, use Select for bulk organization, then switch to Canvas and drag pins until an alignment guide appears. Try Undo, Redo, Remix, and Tidy.
5. Use Edit to change the cover/crop, theme, and layout. Use Activity and Share to publish a read-only link or invite an editor.
6. Open Explore and switch among For You, Following, and Trending. Try multi-select saving and More like this / Not interested.
7. Open a public pin to Like, Comment, Reply/@mention, Share, or Send it into Messages with an optional note.
8. Visit another profile to follow/message them or follow one of their public collections.
9. Press ? for keyboard help. N creates a collection, S opens Quick Capture, and / focuses search.

RUN LOCALLY
Requirements:
- Node.js 20.19+ or 22.12+
- npm

From the repository root:
  npm ci
  npm run dev

Open the frontend URL printed by Vite (normally http://127.0.0.1:5173).
The Express REST API runs separately at http://127.0.0.1:3001 during development.

No API key is required.

OPTIONAL SERVICES
Copy .env.example to .env when using optional providers:
- PIXABAY_API_KEY — preferred live image provider.
- VITE_CLOUDINARY_CLOUD_NAME + VITE_CLOUDINARY_UPLOAD_PRESET — browser image uploads through an unsigned preset.
- RESEND_API_KEY + EMAIL_FROM — required 6-digit verification for new accounts when both are configured.
- DEMO_ACCESS_PASSWORD — optional private production access to the seeded reviewer accounts; leave blank to keep them disabled.

Cloudinary should use an unsigned preset restricted to JPEG/PNG/WebP/GIF, a sensible dimension cap, max_file_size 10485760 (10 MB), and disallow_public_id. Never put the Cloudinary API secret in a VITE_* variable.

Pixabay responses are cached in SQLite for 24 hours. Newly saved Pixabay images are copied into Mosaic's media directory instead of relying permanently on the provider URL. Wikimedia/source pages retain attribution links.

PRODUCTION / HOSTING
Build and run the production application with:
  npm run build
  npm start

The Dockerfile and render.yaml provide the production setup. Render mounts /data for the SQLite database and local media. Keep one application instance with this SQLite deployment. Public production traffic should use HTTPS; TRUST_PROXY_HOPS must match the real proxy topology.

For backups, use SQLite's online backup mechanism and preserve /data/media with the database. Do not copy only an open WAL database file and assume it is a complete backup.

VALIDATION
Useful commands:
  npm run test        Backend permissions, social, persistence, security, and rollback tests
  npm run test:e2e    Production Chrome reviewer flows, mobile, XSS, offline/error, and UI regressions
  npm run typecheck   Frontend + backend TypeScript checks
  npm run lint        Frontend lint
  npm run build       Production frontend + backend build

The Playwright suite starts the production server against an isolated database. Mobile checks include 390px and 320px viewports, and security tests verify stored user content remains inert rather than executing as HTML.

ARCHITECTURE / LIMITS
API endpoints are documented in backend/API.md. Development keeps frontend and backend as separate servers as requested by the challenge. Production serves the compiled frontend from Express while preserving the REST API boundary.

Collaboration uses normal API refetch/navigation rather than live multiplayer sockets. Smart views intentionally cap their newest/top result sets. The PWA caches the application shell, not private API responses or arbitrary third-party images. Offline writes fail clearly instead of being queued for later. Share-target behavior depends on browser support.

REFLECTION (under 100 words)
This challenge pushed me beyond CRUD into permissions, collaboration, optimistic UI, rollback behavior, responsive design, and product tradeoffs. I reinforced React, TypeScript, Express, REST APIs, and database modeling while learning that polish is often less about adding visual effects and more about making many small states behave consistently. The most interesting part was connecting sharing, ownership, notifications, social features, and recovery behavior without making the interface feel fragmented. I also learned to choose complexity based on what improves the product rather than what is most visually impressive or technically fashionable.

FEEDBACK
I liked that the prompt left room for interpretation and made functionality the priority while still rewarding creativity. That flexibility encouraged me to go well beyond the base requirements. The only thing I would add is a little more guidance about how reviewers weigh deep product extensions versus infrastructure/architecture experiments, because both are interesting ways to take the challenge.
