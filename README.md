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

The frame chrome on the page is ported from the Control Area frame in Figma
(`great-rhino`, node `4106:125`) and the live `thumb_templates` row: corner
radius 16/244 and stroke 2.5/244 of the frame width, the light band on its
`gradDir` edge with `bandStops()`'s smootherstep fade, the colour glow and the
white overlay bloom, and the provider tab (radius 8/8/0/0). Layer geometry uses
the app's own model — each layer's contain-fit scaled by `k` (`logoScale × 2.2`
for logos) and centred on the 9-point anchor — driven by the template's real
per-size layouts.

[`public/landing-framer.html`](public/landing-framer.html) is a complete
side-landing in the thumbs.store Framer design system on a fluid 1440px grid:
a centred hero with the live editor inside it, a marquee strip, the problem
grid, then the process as seven animated sections — CSV upload/matching,
branded frame (the 3D exploded layer anatomy), scale at any size (the live
four-cut row), colour/white/text logo variants with translations, CSS light
animations, AI motion, and API export with format chips — plus a white-label
dashboard service card, the shipped-output card and CTA. All CSS-animated,
self-contained, no build step, with static fallbacks under reduced motion.

[`public/landing-et.html`](public/landing-et.html) is the same side-landing
rebuilt in the Endless Tools design language: Inter throughout, pure-black open
sections on a 1270px column (no card wrappers), rounded-full pill buttons
(white primary that turns yellow on hover, ring secondary), numbered-circle
step tags, `#121212`/`ring-#222222` benefit cards, a border-strip marquee and a
`#2C5CFF` selection accent inside the editor — with the thumbs.store logo
lockup kept verbatim. Same live widget, template numbers and animations as the
Framer version.

[`public/pricing-et.html`](public/pricing-et.html) is a **draft** pricing page in
the same Endless Tools skin, positioned against Lobby Magic's published rates:
a credit model (1 thumbnail in 1 size = 1 credit, every size the same price,
CSS animations free, AI animation 10 credits), three casino plans plus a
white-label Aggregator/Platform tier, batch credit packs from −20% (valid 12
months, credits roll over 3 months), an interactive calculator that prices the
visitor's catalogue on both thumbs.store and Lobby Magic's public rates with a
year-one comparison, a usage-dashboard mock, and a draft feature matrix. All
numbers live in one `CFG` object at the top of the script for easy tweaking.

The Endless Tools-skinned pages now form a small site with a shared nav
(Home / Studio / Pricing / Blog / Roadmap + Log in / Sign up):

- [`public/home-et.html`](public/home-et.html) — the conversion-focused
  homepage: hero with a fan of five real-template renders, provider marquee,
  stats band, three-step how-it-works, studio teaser (four live cuts), benefit
  cards, pricing teaser, roadmap/blog teasers, sign-up CTAs throughout, and a
  sitemap footer. Log in / Sign up point at `app.thumbs.store` placeholders.
- [`public/landing-et.html`](public/landing-et.html) — the detailed **Studio**
  page (live editor + full process), linked from the homepage.
- [`public/roadmap-et.html`](public/roadmap-et.html) — Now / Next / Later
  columns with shipped/beta/building/planned states.
- [`public/blog-et.html`](public/blog-et.html) — blog index with draft post
  cards (marked "publishing soon") and an email-capture card.

The design language for all of it is documented in
[`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md).

### The deployable website (`site/`)

[`site/`](site/) is the production website built from those pages with clean
URLs and full SEO plumbing, ready for Vercel static hosting:

| URL | file | source page |
| --- | --- | --- |
| `/` | `index.html` | `public/home-et.html` |
| `/studio` | `studio.html` | `public/landing-et.html` |
| `/pricing` | `pricing.html` | `public/pricing-et.html` |
| `/blog` | `blog.html` | `public/blog-et.html` |
| `/roadmap` | `roadmap.html` | `public/roadmap-et.html` |

Each page carries a canonical URL on `https://www.thumbs.store`, Open Graph +
Twitter cards pointing at `/og.png` (1200×630, rendered from the real logo),
`index, follow` robots, and JSON-LD (Organization, WebSite,
SoftwareApplication, Product offers, Blog, BreadcrumbLists). The directory
also ships `sitemap.xml`, `robots.txt`, `favicon.svg` (the brand mark),
`404.html` and `vercel.json` (`cleanUrls`, security headers).

Deploying: the folder is a zero-build static site — point a Vercel project at
the repo with **Root Directory = `site`**, or `vercel deploy site/`. To attach
the real domain later: Vercel project → Settings → Domains → add
`thumbs.store` / `www.thumbs.store`; the canonicals and sitemap already point
there, so no page changes are needed.

Two standalone builds of the editor live in `public/`:
[`editor.html`](public/editor.html) is the neutral one, and
[`editor-framer.html`](public/editor-framer.html) is restyled to the thumbs.store
Framer site — the `--token-0af6a8ba…` yellow, `#171717` cards at 24px, PP Mori /
PP Right Grotesk Wide / PP NeueBit (loaded by `@font-face` from
framerusercontent so it also works inside an Embed iframe), and the site's 6px
button shapes. Both are scoped under `#ts-editor` and respond to their own
container, not the viewport.

The hero editor is **live** — visitors drag the key visual, grab a corner to
resize it, nudge with the arrow keys, flip through four frame sizes
(each keeping its own layout, as in the app), recolour the
frame from the palette, toggle the provider badge and the white logotype, and
Export PNG redraws the frame to a canvas at its true pixel size. It shows real
work rather than mock-ups: the game shelf loads seven baked WebP
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
