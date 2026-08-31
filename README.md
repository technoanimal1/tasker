# thumbs.store — Design Studio (MVP)

A scalable dashboard for producing per-client design deliverables from a shared
set of brand assets — so you stop hand-maintaining a pile of one-off design
files every time the product changes.

## The idea

- **Brand assets** (background, key visual, logotype) are uploaded once and
  **shared**. Frames reference them *by kind*, not by copy — so replacing the
  key visual updates every frame on every branch at once.
- **Frames** are sized design canvases (OG image, square, story, banner, …)
  built from layers: the shared assets plus text and shapes.
- **Branches** hold frame-layout variants. Fork a branch for a client and its
  frames diverge, while the core brand stays shared. A product-wide asset change
  propagates everywhere; only the per-client *layout* lives on the branch.

```
        shared, referenced by kind                per-branch layouts
   ┌───────────────────────────────┐        ┌──────────────────────────┐
   │ background · key visual · logo │───────▶│ main   → frames…         │
   └───────────────────────────────┘        │ acme   → frames… (fork)  │
        swap one → updates all              │ beta   → frames… (fork)  │
                                             └──────────────────────────┘
```

## Stack

- **Vite + React + TypeScript**, **Tailwind CSS**
- **Supabase** (`thumbs-store` project): Auth, Postgres (`brand_assets`,
  `branches`, `frames`), and a public **Storage** bucket (`brand-assets`)
- No canvas library — the builder and PNG export are hand-rolled (drag/resize
  layers; export renders the frame to a `<canvas>` at full resolution)

## Features (MVP)

- Email + password auth
- **Brand assets**: drag-drop upload of background / key visual / logo; replace
  to update everywhere
- **Branches**: create empty or **fork** the current branch (copies its frames,
  shares the assets)
- **Frame builder**:
  - Add layers — shared assets (by kind), text, rectangles
  - Drag to move, corner-handle to resize, properties panel (position, size,
    rotation, opacity, z-order; text content/size/weight/color/align; rect
    fill/radius), canvas size + background
  - Live preview, save layout, **Export PNG**

## Data model (`thumbs-store`)

| Table | Purpose |
| --- | --- |
| `brand_assets` | Shared core assets (`kind` = background \| key_visual \| logo), one active per kind |
| `branches` | Named layout variants; `parent_branch_id` records fork lineage |
| `frames` | Sized canvas + `layout` (jsonb layers), scoped to a branch |

RLS: any authenticated user manages the design data (internal team tool).
Storage bucket `brand-assets` is public-read, authenticated-write.
SQL: [`supabase/thumbs-store/0002_design_system.sql`](supabase/thumbs-store/0002_design_system.sql).

## Getting started

```bash
npm install
cp .env.example .env   # set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (thumbs-store)
npm run dev            # http://localhost:5173
```

## Landing page

A standalone marketing page lives at [`public/landing.html`](public/landing.html)
— no build step, no dependencies. Vite copies `public/` verbatim, so it is served
at `/landing.html` in dev and in the deployed build; the CTAs point back at `/`
(the app).

It shows real work rather than mock-ups: the game shelf loads seven baked WebP
previews from the public `previews` bucket, and the editor canvas and the frame-size
row composite the raw layers (`bg.jpg` / `kv.png` / `logoWhite.png`) from the public
`assets` bucket, laid out the way `defaultLayout()` does — portrait stacks the key
visual over the logotype, landscape splits KV-left / logo-right. Each frame's stroke
and light band use that game's stored `accent_color`. Re-baking a preview changes its
`preview_sig`, which is in the URL, so swap the `?v=` string when you refresh one.

## Scripts

- `npm run dev` — dev server
- `npm run build` — typecheck + production build
- `npm run preview` — preview the production build

## Roadmap

- Import assets directly from Figma (paste a frame link)
- Per-element branch overrides (git-style inherit/override) and a base template
- Batch export (all frames on a branch → ZIP) and size variants per frame
- Publish/serve rendered frames via an API for client sites
