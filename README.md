# Mosaic

Mosaic is my response to the **Change++ Fall 2026 Coding Challenge**: build an image saving/sharing app where users can discover, save, organize, and share content.

The original prompt and scoring rubric are preserved in [original_challenge.md](original_challenge.md). The required submission-format instructions, demo accounts, setup details, and short reflection are also available in [README.txt](README.txt).

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

The login screen includes a one-click demo account.

Seeded accounts:

    Owner:        demo@mosaic.local / demo1234
    Collaborator: sam@mosaic.local  / demo1234

The demo database is persistent. It is not reset on every restart.

## Thought process

The biggest shift in my thinking during this challenge was realizing that getting a feature to work is different from making it trustworthy.

A basic save button is straightforward. A save flow that handles duplicates, permissions, provider failures, undo, collaboration, privacy, and stale data is much more interesting. The same was true for sharing: making a public URL was easy; making public, followers-only, private, collaborator, invite, and direct-message behavior agree with each other required much more careful design.

I also learned to prefer features that reinforce the core product loop. The Canvas, sections, recommendations, collaboration, and social discovery all give users another reason to return to the same saved content instead of existing as isolated extras.

## Reflection

This challenge pushed me beyond a basic CRUD application into account permissions, collaboration, optimistic UI updates, rollback behavior, deployment, and responsive product design.

I reinforced React, TypeScript, Express, REST APIs, and database modeling, but the most useful lesson was how much engineering lives in edge cases. Privacy changes need to propagate everywhere. Failed writes should not leave half-created state. External APIs need fallbacks. Data that looks portable should actually be portable.

The part I enjoyed most was turning a relatively open-ended prompt into something with its own product identity rather than treating the rubric as a checklist.

## Feedback on the challenge

I liked that the prompt left room for interpretation and rewarded both engineering and creativity. The broad requirements made it possible to choose an architecture I was comfortable with and then spend time improving the parts of the product I cared about.

The rubric was also useful because it made the baseline expectations clear while still leaving space for extensions.

## Submission

Full Name: **Ethan B. Chen**

Vanderbilt Email: **ethan.b.chen@vanderbilt.edu**

The original challenge requires a README.txt, so I kept that file in the repository for submission compatibility.

Original prompt: [original_challenge.md](original_challenge.md)

Submission README: [README.txt](README.txt)
