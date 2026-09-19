# Mosaic

Mosaic is my response to the **Change++ Fall 2026 Coding Challenge**: build an image saving/sharing app where users can discover, save, organize, and share content.

**Live app:** https://mosaic-f33m.onrender.com/

The original prompt and scoring rubric are preserved in [original_challenge.md](original_challenge.md). The required submission-format instructions, setup details, and short reflection are also available in [README.txt](README.txt).

## Why I built it this way

I wanted Mosaic to feel like an actual product, not a tech demo.

I could have spent a lot of time adding an AI agent, embeddings/vector search, extra services, or turning the whole experience into a Three.js/WebGL demo just because those things sound advanced. I decided not to do that unless they actually made the app better to use. The welcome screen does use a small Three.js ambient mosaic, pointer-responsive depth, and restrained transitions, but the product itself stays standard React/CSS UI.

The harder part for me was making the whole save → organize → share flow feel connected: discovery, saving, collaboration, messages, social features, bulk organization, privacy, mobile behavior, error handling, and the Canvas.

I'd rather have a bunch of useful features that work well together than one flashy subsystem that mostly looks good in a stack diagram. The goal was to build something people could keep using after the demo.

## What I focused on

I did not want to stop at the minimum CRUD requirements. I wanted a reviewer to be able to open Mosaic, understand it quickly, and actually use it without feeling like they were clicking through a coding challenge.

I started with the core loop the prompt asked for:

- create collections
- discover or add images
- save and edit pins
- remove pins
- view collections
- share collections

From there, I kept asking what would make it feel more complete. That led to accounts, privacy controls, collaboration, social discovery, direct messages, recommendations, collection tools, and a draggable visual Canvas.

## Tech choices

I used **React + TypeScript** for the frontend and **Node.js + Express** for the REST API. I went with **SQLite** because it keeps setup simple while still giving the app a real persistent relational database instead of localStorage.

In production, one Node process serves both the API and the built React app. That keeps deployment simple while still letting the frontend and backend stay separate during development.

For image discovery, Mosaic works without any API keys by using Wikimedia Commons plus a bundled fallback catalog. Pixabay can be enabled as an optional search provider. Cloudinary is also optional for direct file uploads.

I took the same approach with recommendations. Mosaic uses saved interests, social signals, popularity, and **More like this / Not interested** feedback without needing a paid model API. I liked that anyone reviewing the project can run it without setting up an AI service first.

### Why not Three.js / WebGL everywhere?

I thought about going much harder on the Awwwards-style stuff, but Mosaic is an app people are supposed to keep using, not a portfolio landing page. The welcome screen gets a restrained Three.js ambient field and motion polish; search, saving, organizing, editing, and collaborating stay fast, clear, and conventional instead of depending on shader-heavy transitions.

The freeform Canvas is intentionally DOM/CSS instead of WebGL. Pins still need normal focus behavior, text, menus, selection, dragging, saved positions, keyboard controls, and decent mobile behavior. Standard UI primitives made that much easier to keep predictable and testable.

Same idea with AI agents, embeddings, and extra microservices: I did not want to add them just to make the stack sound more complicated. They are useful when they solve a real problem. Here, they would mostly add setup, latency, API keys, and more ways for the app to break.

## External services and integrations

- **Render** — production hosting, health checks, and persistent disk storage.
- **Pixabay API** — preferred live image discovery provider when configured.
- **Wikimedia Commons** — keyless live search fallback.
- **Cloudinary** — optional direct image uploads through a restricted unsigned upload preset.
- **Resend** — optional 6-digit signup verification email delivery.
- **GitHub** — source control and deployment source.
- **Docker** — reproducible production build/runtime packaging.

These are add-ons around the product, not things the app needs just to work. You can clone Mosaic and run it without a paid AI/model service.

## How it grew

The challenge only required the basic image-saving workflow, but I kept building in areas that felt useful instead of adding random features just to make the list longer.

### Collections and organization

Collections support descriptions, covers, themes, layouts, sections, tags, filtering, bulk actions, persistent drag/keyboard reordering, undo after deletion, and portable JSON export/import. There is also a full-screen presentation mode for walking through a board one save at a time.

The Canvas became the main visual feature. Saved images can be dragged into a freeform composition, nudged with the keyboard, aligned with guides, and rearranged with Remix/Tidy controls.

### Sharing and collaboration

Collections can be private, followers-only, or public. Public sharing uses revocable URLs, including a read-only presentation view with social-preview metadata for shared links.

Owners can also collaborate with other accounts. Editors have scoped permissions, can join through revocable invite links, and can leave a collection. Activity history and notifications make shared changes easier to follow.

### Social features

I added public profiles, user and collection follows, For You / Following / Trending feeds, likes, threaded comments, mentions, direct messages, pin sharing through messages, privacy-safe repin provenance, and previous/next browsing inside a collection from pin detail pages.

Discover also remembers recent and saved searches, supports live suggestions and result-type filters, and keeps the existing recommendation system based on saved interests plus explicit **More like this / Not interested** feedback.

### Reliability and privacy

A lot of the work ended up being stuff you do not really see in screenshots. I added transactions, rollback behavior, session handling, permission checks, private-data filtering, rate limiting, security headers, provider fallbacks, media cleanup, and regression tests for cases where data could leak or get out of sync.

Portable collection exports are self-contained for locally stored provider images, so importing an export does not silently create broken image references.

## Running locally

Requirements:

- Node.js 20.19+ or 22.12+
- npm

From the repository root:

    npm ci
    npm run dev

Vite normally opens the frontend at http://127.0.0.1:5173, while the Express API runs at http://127.0.0.1:3001.

No API key is required.

Optional environment variables are documented in [.env.example](.env.example):

    PIXABAY_API_KEY=
    VITE_CLOUDINARY_CLOUD_NAME=
    VITE_CLOUDINARY_UPLOAD_PRESET=
    RESEND_API_KEY=
    EMAIL_FROM=

## Production / hosting

The repo includes a Dockerfile and render.yaml for deployment on Render.

Production uses a persistent /data volume for SQLite and locally persisted media. The app should run as a single instance because SQLite and local media are intentionally not configured for horizontal multi-instance deployment.

Useful release checks:

    npm run typecheck
    npm run lint
    npm test
    npm run build
    npm run test:e2e

## Thought process

The biggest shift in my thinking during this challenge was realizing that getting a feature to work once is very different from making it reliable.

A basic save button is straightforward. A save flow that handles duplicates, permissions, provider failures, undo, collaboration, privacy, and stale data is much more interesting. The same was true for sharing: making a public URL was easy; making public, followers-only, private, collaborator, invite, and direct-message behavior agree with each other required much more careful design.

I also learned to prefer features that reinforce the core product loop. The Canvas, sections, recommendations, collaboration, and social discovery all give users another reason to return to the same saved content instead of existing as isolated extras.

That is also why I tried not to add technology just because it sounds advanced. An AI agent, vector database, extra service, or WebGL scene can be great when it is actually the right tool. For this project, I thought it made more sense to spend that time on the parts users touch and the reliability work underneath them.

## Reflection

This challenge pushed me beyond a basic CRUD application into account permissions, collaboration, optimistic UI updates, rollback behavior, deployment, and responsive product design.

I reinforced React, TypeScript, Express, REST APIs, and database modeling, but the most useful lesson was how much engineering lives in edge cases. Privacy changes need to propagate everywhere. Failed writes should not leave half-created state. External APIs need fallbacks. Data that looks portable should actually be portable.

The part I enjoyed most was turning a relatively open-ended prompt into something with its own product identity rather than treating the rubric — or an advanced-sounding technology list — as a checklist.

## Feedback on the challenge

I liked that the prompt left room for interpretation and rewarded both engineering and creativity. The broad requirements made it possible to choose an architecture I was comfortable with and then spend time improving the parts of the product I cared about.

The rubric was also useful because it made the baseline expectations clear while still leaving space for extensions.

## Submission

Full Name: **Ethan B. Chen**

Vanderbilt Email: **ethan.b.chen@vanderbilt.edu**

The original challenge requires a README.txt, so I kept that file in the repository for submission compatibility.

Original prompt: [original_challenge.md](original_challenge.md)

Submission README: [README.txt](README.txt)

## Demo login

The site does not advertise a demo login, but reviewers can use the seeded account directly from the normal sign-in form:

    Email: demo@mosaic.local
    Password: demo1234

The demo database is persistent and is not reset on every restart.
