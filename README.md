# Mosaic

Mosaic is my response to the **Change++ Fall 2026 Coding Challenge**: build an image saving/sharing app where users can discover, save, organize, and share content.

**Live app:** https://mosaic-f33m.onrender.com/

The original prompt and scoring rubric are preserved in [original_challenge.md](original_challenge.md). The required submission-format instructions, setup details, and short reflection are also available in [README.txt](README.txt).

## Product philosophy

Mosaic deliberately prioritizes **product depth over technical spectacle**.

It would have been easy to make the submission look more sophisticated on paper by attaching a separate AI chat/agent service, an embeddings/vector-search pipeline, extra microservices, or a cinematic Three.js/WebGL layer. I chose not to treat those technologies as accomplishments by themselves. A stack being harder to explain does not make the product better; complexity earns its place only when it materially improves the user's job.

For Mosaic, the more useful challenge was making the entire save → organize → share loop feel complete: fast discovery, reliable persistence, collaboration, messaging, social interactions, bulk organization, privacy controls, mobile behavior, failure recovery, and a Canvas that users can actually manipulate.

I would rather have ten product interactions that work together cleanly than one flashy subsystem that mainly makes an architecture diagram longer. The goal was a product someone could keep using after the demo, not a simpler core surrounded by advanced-sounding side systems.

## My approach

I did not want to stop at the minimum CRUD requirements. My goal was to make the challenge feel like a small real product: something a reviewer could open, understand quickly, and actually use.

I started with the core loop the prompt asked for:

- create collections
- discover or add images
- save and edit pins
- remove pins
- view collections
- share collections

From there, I kept asking what would make each part feel closer to a real consumer app rather than a coding-challenge demo. That led to accounts, privacy controls, collaboration, social discovery, direct messages, recommendations, collection organization tools, and a draggable visual Canvas.

## Technical decisions

I used **React + TypeScript** for the frontend and **Node.js + Express** for the REST API. I chose **SQLite** because it keeps the project simple to run while still giving the application real persistent relational data instead of relying on local storage.

The production app is served from one Node process. Express serves both the API and the compiled React frontend, which makes deployment simpler while keeping the frontend/backend REST boundary clear during development.

For image discovery, Mosaic works without any API keys by using Wikimedia Commons plus a bundled fallback catalog. Pixabay can be enabled as an optional search provider. Cloudinary is also optional for direct file uploads.

The same principle shaped the recommendation system. Mosaic uses saved interests, social signals, popularity, and explicit **More like this / Not interested** feedback without requiring a paid model API. I preferred a recommendation system every reviewer can run over making the core experience dependent on an external AI service.

### Why not Three.js / WebGL everywhere?

I considered a much heavier Awwwards-style presentation, but Mosaic is a repeated-use image product, not a portfolio landing page. Search, scanning, saving, organizing, editing, and collaborating all benefit more from responsiveness and clarity than from shader transitions or a 3D hero.

The freeform Canvas is intentionally DOM/CSS-based rather than WebGL. Pins need normal focus behavior, text, menus, selection, drag state, persisted coordinates, keyboard interaction, and reliable mobile behavior. Using standard interface primitives made those interactions easier to keep accessible and testable.

Likewise, I did not bolt on an AI-agent service, model-dependent chat layer, embedding pipeline, or separate microservice simply to increase the apparent sophistication of the stack. Those are useful when they solve a real problem; otherwise they add credentials, latency, setup cost, and new failure modes while doing little for the core product.

## External services and integrations

- **Render** — production hosting, health checks, and persistent disk storage.
- **Pixabay API** — preferred live image discovery provider when configured.
- **Wikimedia Commons** — keyless live search fallback.
- **Cloudinary** — optional direct image uploads through a restricted unsigned upload preset.
- **Resend** — optional 6-digit signup verification email delivery.
- **GitHub** — source control and deployment source.
- **Docker** — reproducible production build/runtime packaging.

These are integrations around the product, not requirements for the core experience. Mosaic can be cloned and run without a paid AI/model service.

## How the project evolved

The challenge only required the basic image-saving workflow, but I expanded the project in areas that seemed useful rather than adding features only for feature count.

### Collections and organization

Collections support descriptions, covers, themes, layouts, sections, tags, filtering, bulk actions, undo after deletion, and portable JSON export/import.

The Canvas became the main visual feature. Saved images can be dragged into a freeform composition, nudged with the keyboard, aligned with guides, and rearranged with Remix/Tidy controls.

### Sharing and collaboration

Collections can be private, followers-only, or public. Public sharing uses revocable URLs.

Owners can also collaborate with other accounts. Editors have scoped permissions, can join through revocable invite links, and can leave a collection. Activity history and notifications make shared changes easier to follow.

### Social features

I added public profiles, user and collection follows, For You / Following / Trending feeds, likes, threaded comments, mentions, direct messages, pin sharing through messages, and privacy-safe repin provenance.

Recommendations use a user's saved interests and explicit **More like this / Not interested** feedback rather than being a static feed.

### Reliability and privacy

A lot of the work ended up being less visible than the UI. I added transactional database operations, rollback behavior, session handling, permission checks, private-data filtering, rate limiting, security headers, provider fallbacks, media cleanup, and regression tests for cases where data could otherwise leak or become inconsistent.

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
    DEMO_ACCESS_PASSWORD=

## Production / hosting

The repo includes a Dockerfile and render.yaml for deployment on Render.

Production uses a persistent /data volume for SQLite and locally persisted media. The app should run as a single instance because SQLite and local media are intentionally not configured for horizontal multi-instance deployment.

Useful release checks:

    npm run typecheck
    npm run lint
    npm test
    npm run build
    npm run test:e2e

## Demo

New databases seed realistic sample content so the public product does not look empty, but **production access to the seeded demo accounts is disabled by default**.

If private reviewer access is needed, the deployment can set `DEMO_ACCESS_PASSWORD` and share that password privately. No reviewer password is committed to the repository, and the old seeded passwords do not work in production.

The database is persistent and is not reset on every restart.

## Thought process

The biggest shift in my thinking during this challenge was realizing that getting a feature to work is different from making it trustworthy.

A basic save button is straightforward. A save flow that handles duplicates, permissions, provider failures, undo, collaboration, privacy, and stale data is much more interesting. The same was true for sharing: making a public URL was easy; making public, followers-only, private, collaborator, invite, and direct-message behavior agree with each other required much more careful design.

I also learned to prefer features that reinforce the core product loop. The Canvas, sections, recommendations, collaboration, and social discovery all give users another reason to return to the same saved content instead of existing as isolated extras.

That is also why I resisted adding technology simply because it sounds advanced. An AI agent, vector database, extra service boundary, or WebGL scene can be excellent when it is the right solution. In this project, I thought the stronger engineering decision was to spend that complexity budget on the parts users actually touch and on the reliability work underneath them.

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
