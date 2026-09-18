MOSAIC — CHANGE++ FALL 2026 CODING CHALLENGE

Full Name: Ethan B. Chen
Vanderbilt Email: ethan.b.chen@vanderbilt.edu

ABOUT
Mosaic is an image discovery, saving, collaboration, and social curation app inspired by Pinterest. It includes live web search with personalized and related-query recommendations, tunable public-pin recommendations with More like this / Not interested feedback, social feeds, profile and collection follows, privacy-safe repin provenance, multi-select Explore saving, profiles, direct messages, likes/threaded comments with @mentions, Quick Save, smart collections, board sections, tags/filtering, bulk move/copy organization, customizable boards, a draggable Canvas with alignment guides and undo/redo, private/followers/public sharing, account collaboration, notifications, PWA capture/install support, and activity history.

REQUIREMENTS
- Node.js 20.19+ or 22.12+
- npm

RUNNING THE APP
1. From the repository root, install dependencies:
   npm ci

2. Start the frontend and backend together:
   npm run dev

3. Open the frontend URL printed by Vite (normally http://127.0.0.1:5173).
   The Express API runs on http://127.0.0.1:3001.

No API key is required. Use Node 22 LTS for the same runtime as Docker. Search uses Wikimedia Commons automatically and falls back to Mosaic's bundled catalog if a remote provider is unavailable.

OPTIONAL API KEYS
Copy .env.example to .env.
- PIXABAY_API_KEY enables Pixabay as the preferred search provider.
- VITE_CLOUDINARY_CLOUD_NAME + VITE_CLOUDINARY_UPLOAD_PRESET enable direct file uploads using an unsigned Cloudinary preset.

Without Cloudinary, users can add pins from a direct HTTPS image URL. A webpage URL is a source link, not necessarily an image. Restart Vite after editing .env; production VITE_* values are compiled into the frontend and require a rebuild. Never put a Cloudinary API secret in VITE_* variables.

Use an unsigned Cloudinary preset restricted to JPEG/PNG/WebP/GIF, max_file_size 10485760 (10 MB), disallow_public_id, and appropriate incoming dimension limits. The cloud name and preset are public client settings; monitor account usage. Uploads are optional and need a real configured account to verify end-to-end.

Pixabay search responses are cached in SQLite for 24 hours, provider calls are guarded below Pixabay's published per-key rate limit, and Pixabay is named directly anywhere its search results are shown. New saved Pixabay pins are copied to the media directory beside the database instead of permanently hotlinking provider URLs; approved Pixabay/CDN redirects are validated on every hop before download. Keep that media directory with your database backups. Wikimedia/source pages retain attribution links. External images and services can still be unavailable.

REVIEWER DEMO
The login screen includes a one-click demo login. This is a shared, editable demo account, not an isolated sandbox. Use Create account for your own private collections. Demo content is seeded only on a new database and is not reset on restart. You can also use:
- Owner: demo@mosaic.local / demo1234
- Collaborator: sam@mosaic.local / demo1234

Suggested walkthrough:
1. Discover an image and use one-click Save. Mosaic remembers the last collection; the small arrow still lets you choose another.
2. Open Collections and try the Recently saved / Most liked / Unsorted smart views, then open a normal collection.
3. Filter that collection by title, note, or tag. Use Select to bulk move/delete pins, with Undo available after destructive actions.
4. Choose Edit to set the cover/crop plus a restrained board theme and Gallery/Compact/Masonry layout.
5. In Grid, create a named Section, select one or more pins, and Organize them; selected pins can also be moved or copied to another collection. Then open Canvas, drag until an alignment guide appears, and try Undo, Redo, Remix, and Tidy.
6. Open Activity, then Share to create a polished view-only URL or add sam@mosaic.local as an editor.
7. Open Explore to see the “Because you saved…” recommendation shelf, then switch between For You, Following, and Trending. Use Select to choose up to 30 public pins and save them to one collection in a batch; duplicate sources are skipped cleanly. Individual Save still supports duplicate warnings, a private note, and Undo.
8. Open a public pin to Like, Comment, Share, or Send it into a recent conversation as a tappable pin preview, then keep scrolling through both Mosaic-related pins and the live "More like this" discovery trail.
9. Open Sam Rivera's profile and choose Message. The Messages inbox keeps private one-to-one threads, shared-pin previews, unread counts, and a Save action for shared pins separate from collection notifications.
10. Press ? for keyboard help. N creates a collection, S opens Quick Capture, and / focuses search. The account menu can also replay the first-run tour.
11. Use Quick Capture to save an image URL or receive content through the installed PWA share target. With Cloudinary configured, local file upload is also available.
12. Reply to a pin comment or type an exact `@Name`, then check Notifications for reply/mention alerts alongside shared edits, follows, and likes.

PRODUCTION / HOSTING
- npm run build
- npm start

In production, Express serves the built React app and API from one process on PORT (default 3001). Dockerfile provides the same one-service setup and uses /data/mosaic.sqlite for persistent storage. Mount /data as a persistent volume on the host. `render.yaml` is a ready-to-connect Render Blueprint with the health check, disk, Docker build, graceful shutdown window, and optional API-key placeholders already declared. It selects a paid Starter service because persistent disks are not available on free instances. Keep one instance: SQLite and local media are not a multi-instance deployment.

Render setup:
1. Connect the reviewed repository to a Render Blueprint. Confirm the /data persistent disk is attached.
2. Leave optional provider values blank or configure them in Render. Render passes Docker service environment variables as build arguments; changing VITE_* values requires rebuilding.
3. TRUST_PROXY_HOPS=1 is for the single trusted reverse proxy. For another host, configure the actual trusted topology; leave 0 for direct hosting. Serve public production traffic over HTTPS (production session cookies are Secure).
4. Verify /api/health, create a test account/pin, redeploy, and verify the same data remains.
5. Back up SQLite with its online backup API (do not copy only an open WAL database file) and /data/media together. Test restore before relying on backups. Deleted image files are retained so restored/shared pins do not break; monitor disk usage.

Local container check:
  docker build -t mosaic .
  docker run --rm -p 3001:3001 -v mosaic-data:/data mosaic
Open http://localhost:3001. Public hosting requires HTTPS. Stop gracefully so SQLite closes cleanly.

USEFUL COMMANDS
- npm run test       Backend permissions, social, integrity and restart regression tests
- npm run typecheck  TypeScript checks for frontend and backend
- npm run lint       Frontend lint
- npm run build      Production builds for frontend and backend
- npm run test:e2e   Production Chrome reviewer flows + 390px + offline/error regression tests (requires Chrome; install with npx playwright install chrome)

ARCHITECTURE AND LIMITS
React/TypeScript + Radix frontend; separate Express REST backend; SQLite WAL persistence. API endpoints are documented in backend/API.md. Development uses two servers; production serves compiled static assets from Express while keeping the REST boundary.

Search results are paginated; the initial 12 Mosaic picks are a curated catalog. Smart views show the newest/top 60 saves. Collaboration is account-based, with updates fetched on navigation/refetch rather than a live multiplayer connection. Canvas layouts are atomic, and delete Undo preserves pin identity and discussion for 10 minutes.

The PWA caches its app shell, not private API data or third-party images. Already loaded views may remain visible offline; fresh navigation asks you to reconnect. Writes fail with a message and are not queued. Installed share-target support varies by browser and accepts title/text/URLs, not automatic webpage image extraction.

SUBMISSION
Review and push the final working tree, then submit the completion form linked in README.md before the deadline. Local tests cannot verify form submission.

REFLECTION
This challenge pushed me beyond a basic CRUD app into account permissions, collaboration, optimistic UI updates, rollback behavior, and responsive design. I reinforced React, TypeScript, Express, REST APIs, and database modeling while learning how much product polish depends on small interaction details. The most interesting part was building collaboration safely: owner/editor permissions, revocable public links, notifications, and activity history all had to work together without making the interface feel complicated.

FEEDBACK
I liked that the prompt left room for interpretation and rewarded both solid engineering and creativity. The rubric also made it clear which extensions were worth prioritizing once the core requirements worked.
