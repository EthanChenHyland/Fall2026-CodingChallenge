MOSAIC — CHANGE++ FALL 2026 CODING CHALLENGE

Full Name: Ethan B. Chen
Vanderbilt Email: ethan.b.chen@vanderbilt.edu

LIVE DEPLOYMENT
https://mosaic-f33m.onrender.com/

WHAT I BUILT
Mosaic is a Pinterest-inspired app for finding, saving, organizing, and sharing images. I started with the challenge requirements — search, collections, saving/editing/removing content, sharing, and collaboration — and then kept building until it felt more like a real product than a basic CRUD demo.

WHY I BUILT IT THIS WAY
I wanted Mosaic to feel useful, not just technically impressive on paper. I could have spent a lot of time adding an AI chat/agent, embeddings/vector search, extra microservices, or turning the whole experience into a Three.js/WebGL demo just because those things sound advanced. I decided not to unless they actually made the app better to use. The welcome screen uses a restrained Three.js ambient mosaic, pointer-responsive depth, and motion polish; the main product remains standard React/CSS UI.

For me, the harder and more useful problem was making the whole save-organize-share loop work well together: discovery, persistence, collaboration, messages, social features, bulk organization, mobile behavior, error handling, and the Canvas. I'd rather have a lot of useful interactions that fit together than one flashy subsystem that mostly makes the stack diagram longer.

The app includes:
- Live image search with Pixabay when configured, Wikimedia fallback, pagination, autocomplete, recent/saved searches, result-type filters, related searches, and recommendation feedback.
- Accounts, profile handles, editable profiles/avatars, follows, collection follows, follower counts, and public profiles.
- Private, followers-only, and public collections; revocable public share links; private copies of public boards that preserve organization/provenance; owner-only first-party share analytics; account collaborators; and revocable editor invite links.
- Quick Save, multi-select Explore saving, duplicate protection, smart collections, sections, tags, filtering, persistent drag/keyboard reordering, bulk move/copy/delete, and undo.
- Grid, Gallery, Compact, Masonry, and a draggable Canvas with persisted positions, alignment guides, Remix/Tidy, undo, and redo.
- Likes, threaded comments, replies, @mentions, categorized activity history, notifications, privacy-safe repin provenance, public-content reporting, and previous/next pin navigation inside a collection.
- Direct messages with unread state, optional text, attached pin previews, and saving a received pin into a collection.
- Custom collection covers/crops/themes, collection presentation/share views, rich social-link previews, collection export/import, PWA install/share-target support, keyboard shortcuts, onboarding, and responsive mobile behavior.
- Optional Cloudinary uploads, Resend email verification, durable local copies of saved Pixabay media, rate limiting, CSP/security headers, accessible skip/focus landmarks, retry/loading/saving states, and account deletion.

Core functionality does not depend on paid APIs. With no keys configured, Mosaic still runs using Wikimedia and local functionality.

DESIGN DIRECTION
I thought about going much harder on Three.js/WebGL and Awwwards-style effects, but Mosaic is an app people are supposed to keep using, not a portfolio landing page. I kept Three.js scoped to a lightweight ambient welcome-screen field and used restrained motion elsewhere so search, saving, organizing, editing, and collaborating stay fast and clear.

The rubric also cares about working features, maintainability, responsiveness, collaboration, reliability, and creativity. I treated “make the application look good” as making the actual app polished, not turning it into a cinematic intro page.

Same with AI agents, embeddings, or extra microservices: I did not want to add them just to make the project sound more complicated. They can be useful when they solve a real problem, but here they would mostly add setup, latency, API keys, and more ways for the app to break without improving the main workflow.

I spent that time on things users keep running into after the first impression: the draggable Canvas, multi-select organization, undo/recovery, responsive layouts, collection customization, social features, collaboration, and mobile/offline/error states.

The Canvas is also intentionally DOM/CSS instead of WebGL. Pins still need focus behavior, text, menus, selection, dragging, saved positions, keyboard controls, and decent mobile behavior. Standard UI primitives made that easier to keep predictable and testable.

ENGINEERING CHOICES
Frontend: React + TypeScript, Vite, TanStack Query, Radix UI primitives, Lucide icons, Three.js for the welcome ambient field, and hand-written CSS.
Backend: Node.js + Express REST API with separated route/middleware/library modules.
Database: SQLite in WAL mode with foreign keys, transactions, indexes, ownership/membership rules, and persistent production storage.
Production: one Docker service on Render; Express serves the compiled frontend and REST API, with a persistent /data volume.

SQLite was a deliberate choice. Mosaic runs as one app instance, so it keeps setup small while still giving me real persistence, transactions, and rollback behavior. The app does not use localStorage as its database. If this needed horizontal scaling later, PostgreSQL/object storage would be the obvious next step.

Recommendations work the same way: saved interests, follows, popularity, and More like this / Not interested feedback, with no AI key required. I liked that anyone reviewing the project can run the full app without setting up a model service first.

EXTERNAL SERVICES / INTEGRATIONS
- Render — production hosting, health checks, and persistent disk storage.
- Pixabay API — preferred live image discovery provider when an API key is configured; unfiltered discovery rotates recent results across all image types instead of staying in one popularity niche.
- Wikimedia Commons — keyless live image-search fallback so discovery still works out of the box.
- Cloudinary — optional direct image uploads from the browser through a restricted unsigned upload preset.
- Resend — optional 6-digit signup verification email delivery.
- GitHub — source control and submission repository; Render deploys from the main branch.
- Docker — reproducible production build/runtime packaging.

These are optional add-ons around the app, not hard requirements. A reviewer can clone Mosaic, run npm ci + npm run dev, create an account, search, save, organize, share, and collaborate without setting up a paid AI/model service.

RELIABILITY / SECURITY DETAILS
- Database writes that span related records use transactions and rollback on failure.
- Delete/undo preserves pin identity and discussion during the undo window.
- Provider search is cached and rate guarded; downloaded provider media is validated and stored durably.
- Session cookies, CSP/Helmet headers, input validation, URL checks, login throttling, and stored-content XSS regression coverage are included.
- Seeded demo accounts cannot be deleted.
- Production health checks report database and search-provider readiness.
- Share analytics use a random first-party visitor token that is hashed before storage; raw IP addresses are not stored for these counts.
- Public-board copies stay private by default and keep section/layout/cover data plus privacy-safe provenance.

QUICK REVIEW PATH
1. Create an account. With Resend unset locally, registration completes immediately; with Resend configured, Mosaic requires the 6-digit email code.
2. Search in Discover and save an image. Quick Save remembers the last collection; the adjacent menu lets you choose another.
3. Open Collections and try Recently saved / Most liked / Unsorted, then enter a normal collection.
4. Create a Section, use Select for bulk organization, then switch to Canvas and drag pins until an alignment guide appears. Try Undo, Redo, Remix, and Tidy.
5. Use Edit to change the cover/crop, theme, and layout. Reorder a few saves, try Present, then use Activity and Share to publish a read-only link or invite an editor.
6. Open Explore and shuffle the outside-Mosaic discovery section, then switch among For You, Following, and Trending. Try multi-select saving and More like this / Not interested.
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
This challenge pushed me past basic CRUD into permissions, collaboration, optimistic UI, rollback behavior, responsive design, and a lot of edge cases. I reinforced React, TypeScript, Express, REST APIs, and database modeling, but the biggest lesson was that polish usually comes from making lots of small states behave well together. The hardest part was connecting sharing, ownership, notifications, social features, and recovery without making the app feel messy. I also got better at deciding when extra complexity is actually useful instead of adding it just because it sounds advanced.

FEEDBACK
I liked that the prompt was open-ended and still made the baseline expectations clear. It gave me room to go way past the required features without forcing one specific stack. The one thing I would add is a little more guidance on how reviewers weigh deep end-to-end product work against infrastructure experiments or flashy technical extras that may be cool on their own but do not really change the core app.

DEMO LOGIN
The website does not show demo credentials, but reviewers can use the seeded account from the normal sign-in form:

Email: demo@mosaic.local
Password: demo1234

The demo database is persistent and is not reset on every restart.
