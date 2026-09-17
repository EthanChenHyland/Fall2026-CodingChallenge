MOSAIC — CHANGE++ FALL 2026 CODING CHALLENGE

Full Name: Ethan B. Chen
Vanderbilt Email: ethan.b.chen@vanderbilt.edu

ABOUT
Mosaic is an image discovery, saving, collaboration, and social curation app inspired by Pinterest. It includes live web search, For You/Following/Trending feeds, people/board search, public profiles, follows, likes/comments, related pins, URL/file/PWA capture, collections, a draggable Canvas, public sharing, account collaboration, notifications, and activity history.

REQUIREMENTS
- Node.js 20.19+ or 22.12+
- npm

RUNNING THE APP
1. From the repository root, install dependencies:
   npm install

2. Start the frontend and backend together:
   npm run dev

3. Open the frontend URL printed by Vite (normally http://127.0.0.1:5173).
   The Express API runs on http://127.0.0.1:3001.

No API key is required. Search uses Wikimedia Commons automatically and falls back to Mosaic's bundled catalog if a remote provider is unavailable.

OPTIONAL API KEYS
Copy .env.example to .env.
- PIXABAY_API_KEY enables Pixabay as the preferred search provider.
- VITE_CLOUDINARY_CLOUD_NAME + VITE_CLOUDINARY_UPLOAD_PRESET enable direct file uploads using an unsigned Cloudinary preset.

Without Cloudinary, users can still add pins from any image URL.

REVIEWER DEMO
The login screen includes a one-click demo login. You can also use:
- Owner: demo@mosaic.local / demo1234
- Collaborator: sam@mosaic.local / demo1234

Suggested walkthrough:
1. Discover an image and save it to a collection.
2. Open Collections and enter a collection.
3. Edit or remove an item, then try the Canvas tab and drag an image.
4. Open Activity to see collection history.
5. Open Share to toggle Private/Public access or add sam@mosaic.local as an editor.
6. Open Explore and switch between For You, Following, and Trending; open a pin and curator profile, then try Follow, Like, Comment, and Share.
7. Search from Discover to see both live web images and matching Mosaic people/boards.
8. Use Add pin or Quick Capture to save an image URL. With Cloudinary configured, drag/drop or upload a local image file instead.
9. Check Notifications after shared edits, follows, likes, or comments.

PRODUCTION / HOSTING
- npm run build
- npm start

In production, Express serves the built React app and API from one process on PORT (default 3001). Dockerfile provides the same one-service setup and uses /data/mosaic.sqlite for persistent storage. Mount /data as a persistent volume on the host. `render.yaml` is a ready-to-connect Render Blueprint with the health check, disk, Docker build, graceful shutdown window, and optional API-key placeholders already declared.

USEFUL COMMANDS
- npm run test       Backend collaboration + social regression tests
- npm run typecheck  TypeScript checks for frontend and backend
- npm run lint       Frontend lint
- npm run build      Production builds for frontend and backend
- npm run test:e2e   Production Chrome reviewer-flow + 390px mobile smoke tests

REFLECTION
This challenge pushed me beyond a basic CRUD app into account permissions, collaboration, optimistic UI updates, rollback behavior, and responsive design. I reinforced React, TypeScript, Express, REST APIs, and database modeling while learning how much product polish depends on small interaction details. The most interesting part was building collaboration safely: owner/editor permissions, revocable public links, notifications, and activity history all had to work together without making the interface feel complicated.

FEEDBACK
I liked that the prompt left room for interpretation and rewarded both solid engineering and creativity. The rubric also made it clear which extensions were worth prioritizing once the core requirements worked.
