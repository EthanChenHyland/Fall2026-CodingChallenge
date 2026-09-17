MOSAIC — CHANGE++ FALL 2026 CODING CHALLENGE

Full Name: Ethan B. Chen
Vanderbilt Email: ethan.b.chen@vanderbilt.edu

ABOUT
Mosaic is an image discovery, saving, and collaboration app inspired by Pinterest. Users can search for images, create collections, save/edit/remove content, arrange saved images on a draggable Canvas, share view-only public links, and collaborate with other accounts.

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

No API key is required. Mosaic includes a bundled image catalog so search works out of the box.

OPTIONAL PIXABAY SEARCH
Copy .env.example to .env and add a Pixabay API key:
   PIXABAY_API_KEY=your_key_here

If Pixabay is unavailable, Mosaic automatically falls back to the bundled catalog.

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
6. Check Notifications after shared edits.

USEFUL COMMANDS
- npm run test       Backend collaboration/share tests
- npm run typecheck  TypeScript checks for frontend and backend
- npm run lint       Frontend lint
- npm run build      Production builds for frontend and backend

REFLECTION
This challenge pushed me beyond a basic CRUD app into account permissions, collaboration, optimistic UI updates, rollback behavior, and responsive design. I reinforced React, TypeScript, Express, REST APIs, and database modeling while learning how much product polish depends on small interaction details. The most interesting part was building collaboration safely: owner/editor permissions, revocable public links, notifications, and activity history all had to work together without making the interface feel complicated.

FEEDBACK
I liked that the prompt left room for interpretation and rewarded both solid engineering and creativity. The rubric also made it clear which extensions were worth prioritizing once the core requirements worked.
