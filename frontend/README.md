# Mosaic frontend

The frontend is a React 19 + TypeScript + Vite application. It uses React Router for page routing, TanStack Query for server state, Radix UI for accessible dialog/tab primitives, Lucide for icons, Sonner for toasts, and hand-written CSS for the product UI. Three.js is isolated to the ambient welcome experience.

For reviewer-facing setup, credentials, deployment, and the full feature summary, start with [../README.txt](../README.txt).

## Development

From the repository root:

```bash
npm ci
npm run dev
```

The frontend normally runs at `http://127.0.0.1:5173` and proxies `/api` to the Express backend.

Frontend-only commands:

```bash
npm run dev -w frontend
npm run typecheck -w frontend
npm run lint -w frontend
npm run build -w frontend
npm run preview -w frontend
```

Optional browser-upload settings come from the root environment:

- `VITE_CLOUDINARY_CLOUD_NAME`
- `VITE_CLOUDINARY_UPLOAD_PRESET`

Never put a Cloudinary API secret in a `VITE_*` variable because Vite exposes those values to the browser.

## Routes

Protected app routes:

- `/` — Discover
- `/explore` — social/public discovery
- `/collections` — library and smart views
- `/collections/smart/:mode` — recent/popular/unsorted
- `/collections/:id` — collection workspace
- `/people/:identifier` — profile
- `/pin/:id` — pin detail
- `/capture` — direct capture/upload
- `/messages` and `/messages/:conversationId` — direct messages
- `/invite/:token` — editor-invite acceptance

Public routes:

- `/privacy`
- `/shared/:token`
- `/shared/:token/present`

## Main product surfaces

### Discover

Discover combines typed provider search with broad browsing. It supports:

- suggestions from the first typed character
- optional AI-assisted suggested/related visual phrases
- recent and saved searches
- people/public-collection search
- result type, orientation, and ordering filters
- infinite provider browsing
- in-site image previews and saving
- recommendation feedback
- a rapidly clickable Shuffle button

Shuffle always reorders already-loaded Pixabay results immediately. Provider-backed refreshes use a 10-second cooldown so repeated clicks do not spam the upstream API.

Clicking the Mosaic brand while already on Discover remounts the page, clears the active search/topic/filter state and URL parameters, closes shell popovers, and scrolls back to the top.

### Explore

Explore provides For You, Following, and Trending modes plus featured public collections and a provider-backed web section. It includes multi-select batch saving, recommendation feedback, web-image filters, infinite browsing, and the same throttled/local Shuffle behavior. Following intentionally stays community-only; Trending includes the web-discovery section.

### Collections

Collection pages support sections, tags, pin ordering, bulk organize/copy/delete, undo, cover focus, theme/layout controls, activity, collaboration, JSON import/export, presentation mode, and Canvas.

Canvas uses DOM/CSS so normal semantics, focus, keyboard movement, responsive behavior, and testing remain intact.

### Social and messaging

Profiles, user/collection follows, likes, threaded comments, replies, exact-name mentions, notifications, reporting, direct messages, and pin attachments all use normal API-backed state through TanStack Query.

## Application shell

The shell includes:

- desktop sidebar and compact mobile navigation
- topbar Quick actions
- mobile Quick actions popover
- platform-neutral Commands action
- command palette shortcut: `Cmd+K` on macOS or `Ctrl+K` on Windows/Linux
- profile and notifications popovers
- back-to-top control

The command palette can navigate to core surfaces, launch actions, and open collections.

## State and error handling

TanStack Query owns server state. Global query/mutation error handling:

- drops account-scoped cache when a session expires
- keeps offline writes explicit instead of pretending they succeeded
- retries eligible server/network failures
- avoids refetch-on-focus churn
- invalidates related social/public views after mutations

Local component state is used for transient UI state such as filters, open menus, search text, Canvas interaction, and selection.

## Responsive, motion, and accessibility behavior

The E2E suite audits 320px and 390px widths. The UI includes:

- touch-sized controls
- mobile-safe dialogs and popovers
- no horizontal page overflow
- skip links and focusable main landmarks
- keyboard-friendly forms/actions
- dialog descriptions and valid accessibility relationships
- reduced-motion support
- motion/hover/press feedback for navigation, filters, buttons, cards, and popovers

The root document clamps horizontal overflow so modal scroll locking and animated surfaces cannot introduce transient mobile horizontal scrolling.

## Testing

From the repository root:

```bash
npm run typecheck
npm run lint
npm run build
npm run test:e2e
```

The Playwright suite covers the reviewer flow, responsive layouts, Discover reset, autocomplete positioning/closing, quick actions and command palette, reduced motion, import/export, collection/social flows, offline recovery, provider pagination, and Shuffle throttling.

See [../docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md) for the cross-stack design and [../backend/API.md](../backend/API.md) for the REST contract.
