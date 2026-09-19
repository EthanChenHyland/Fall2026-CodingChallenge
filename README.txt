MOSAIC — CHANGE++ FALL 2026 CODING CHALLENGE

Full Name: Ethan B. Chen
Vanderbilt Email: ethan.b.chen@vanderbilt.edu

Mosaic is a Pinterest-style social discovery app for finding, saving, organizing, discussing, and sharing visual content. Beyond the required search/save/share flow, it includes public profiles and follows, recommendations, collaborative collections, direct messages, threaded comments, sections, bulk organization, privacy controls, presentation views, and a draggable Canvas.

LIVE
https://mosaic-f33m.onrender.com/

DEMO LOGIN
Email: demo@mosaic.local
Password: demo1234
The demo database is persistent and is not reset on every restart.

DOCUMENTATION
docs/ARCHITECTURE.md  — full product/system design, tradeoffs, reliability, deployment, and feature flows
backend/API.md        — REST API reference
original_challenge.md — original prompt and scoring rubric

RUN LOCALLY
Requirements: Node.js 20.19+ or 22.12+, npm

From the repository root:
  npm ci
  npm run dev

Frontend: normally http://127.0.0.1:5173
API:      http://127.0.0.1:3001

No API key is required. Optional integrations are configured through .env.example: Pixabay for preferred live image discovery, Cloudinary for direct uploads, and Resend for signup verification.

Production runs as one Docker service on Render with a persistent /data volume for SQLite and locally persisted media.

QUICK REVIEW PATH
1. Sign in with the demo account or create an account.
2. Search or browse in Discover, then save an image.
3. Open a collection, create a Section, try bulk organization, and switch to Canvas.
4. Change the collection cover/theme/layout, then try Present, Activity, and Share.
5. Open Explore and try For You / Following / Trending, recommendation feedback, and multi-select saving.
6. Open a public pin to Like, Comment/Reply/@mention, Share, or Send it through Messages.
7. Visit another profile to follow/message them or follow one of their public collections.

DESIGN NOTE
I tried to put complexity where a reviewer can actually feel it: saving, organization, collaboration, privacy, social behavior, recovery, mobile behavior, and the Canvas. A model call, vector database, extra service, or heavier rendering stack can be the right answer when a product needs it; when it does not, it can mostly add setup and failure modes. The full architecture notes explain those tradeoffs in detail.

VALIDATION
  npm run typecheck
  npm run lint
  npm test
  npm run build
  npm run test:e2e

REFLECTION (under 100 words)
This challenge pushed me past basic CRUD into permissions, collaboration, optimistic UI, rollback behavior, responsive design, and a lot of edge cases. I reinforced React, TypeScript, Express, REST APIs, and database modeling, but the biggest lesson was that polish comes from making many small states behave well together. The hardest part was connecting sharing, ownership, notifications, social features, and recovery without making the app feel messy. I also got better at deciding when extra complexity solves a real problem instead of merely making an architecture diagram look more impressive.

FEEDBACK
I liked that the prompt was open-ended while the baseline requirements stayed clear. That gave me room to choose an architecture intentionally and spend time on both engineering reliability and product design. A little more guidance on how reviewers weigh feature depth, polish, and architecture tradeoffs would make future submissions easier to scope.
