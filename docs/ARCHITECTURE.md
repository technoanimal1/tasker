# thumbs.store — web architecture vision

How the websites, repos, Vercel projects and domains fit together, and the
rules for growing it without repainting later. Status: current as of
2026-09-02.

## The three surfaces

| surface | what it is | audience | domain (target) |
| --- | --- | --- | --- |
| **Marketing site** | static pages: home, /studio, /pricing, /blog, /roadmap | prospects, SEO, social | `thumbs.store` + `www` |
| **Dashboard / Studio (MVP)** | the logged-in product: catalogue, editor, credits, API keys | customers | `app.thumbs.store` |
| **Delivery** | rendered thumbnails + render API | customers' lobbies (machines) | `cdn.thumbs.store` / `api.thumbs.store` |

These have different change rates, different risk profiles and different
audiences — which is exactly why they are separate *deployments*, even though
they share one brand.

## Repos: two, not one (for now)

```
technoanimal1/thumbs-store-dashboard   → the app (dashboard + studio MVP)
technoanimal1/thumbs-store-site        → marketing site (site/) + studio prototypes (public/)
```

- **Keep the dashboard where it is.** It's already a live repo with a linked
  Vercel project. Moving a working app to satisfy repo aesthetics is pure
  risk, zero user value.
- **The marketing site is `site/` in this repo** — zero-build static HTML,
  the whole site is eleven files. It can stay here indefinitely, or be
  extracted to its own `thumbs-store-site` repo later with `git mv` +
  one Vercel re-point; nothing about the site's insides changes either way.
  Extract only when a second person needs commit rights to marketing but not
  to prototypes.
- **Why not one monorepo?** A monorepo earns its keep when code is genuinely
  shared and versioned together. Today the only shared things are (a) the
  design tokens and (b) the template maths — see "shared brand & code"
  below, both solved with a copied file. Revisit the monorepo question when
  a *third* consumer of the render core appears (e.g. the white-label
  build); until then two repos = simpler permissions, simpler CI, simpler
  mental model.

## Vercel: one team, one project per surface

```
Vercel team "personal" (pro)
├── thumbs-store-site       root = site/ (this repo)   → thumbs.store, www.thumbs.store
├── thumbs-store-dashboard  (existing, linked)          → app.thumbs.store
└── (later) api / cdn — likely NOT Vercel: renderer + storage live where
    the images live (Supabase/storage + a worker), fronted by cdn.thumbs.store
```

Rules that keep this manageable:

1. **One project = one domain = one repo root.** Never route two surfaces
   through one project with rewrites — that couples their deploys.
2. **Domains attach to projects, not repos.** Moving a site to a new repo
   later is: link new repo in project settings. The domain never moves.
3. **Marketing stays zero-build.** No framework, no dependencies, no build
   step — deploys in seconds, nothing to rot. The moment someone proposes
   "let's rewrite the marketing site in Next.js", the burden of proof is on
   them: the site has no dynamic data.
4. **The dashboard owns all auth.** Marketing links to
   `app.thumbs.store/login|signup` and never handles credentials — that
   keeps the public site out of security scope entirely.
5. **Previews are the review tool.** Every branch push gives a preview URL
   on both projects; production is whatever `main` (or the configured
   production branch) says. Rollback = one click in Vercel.

## Domains & DNS (Railway hosting — live values)

| record | value | serves |
| --- | --- | --- |
| `www` CNAME | `ll5q3bug.up.railway.app` | marketing (canonical host) — **set at GoDaddy 2026-09** |
| `thumbs.store` (apex) | CNAME/ALIAS `jv19qqlb.up.railway.app` | 301 → www (Caddy) — **blocked at GoDaddy** (no apex CNAME/ALIAS), pending move of DNS to Cloudflare |
| `app` | dashboard host | dashboard |
| `cdn` / `api` | wherever delivery lives | thumbnails / render API |

Cautions for the Cloudflare DNS migration: (1) carry over the **Amazon SES
records** (three `_domainkey` CNAMEs, MX + TXT on `envelope`) or outbound
mail silently fails DKIM; (2) keep Railway and SES records **DNS only**
(grey cloud) — proxying breaks Railway's certificate issuance.

The marketing pages canonicalize to `https://www.thumbs.store/...` and the
sitemap points there — attaching the domain needs **zero page edits**, and
the `up.railway.app` staging URL won't compete in search.

## Shared brand & code

- **Design system:** `docs/DESIGN_SYSTEM.md` is the single source of the
  visual language. Copy it into the dashboard repo (`docs/`) so any work
  session there — human or AI — reads the same tokens, radii, type scale and
  colour rules. When the two copies drift, the marketing one wins (it's the
  brand's face).
- **Template maths:** the renderer's numbers (TEMPLATE layouts, band stops,
  `LOGO_ASPECT_K`, frame metrics) exist in the dashboard app (`src/lib/thumb.ts`)
  and are *mirrored* in the marketing widget. The dashboard is the source of
  truth; when the live template changes, update the constants in
  `site/studio.html` (one `TEMPLATE`/`GRAD` block). If this mirroring starts
  hurting (monthly+ changes), extract `render-core` as a tiny package both
  import — that's the monorepo trigger mentioned above.
- **Copy & pricing:** `docs/LAUNCH_COPY.md` and the pricing `CFG` block in
  `site/pricing.html` are the editable sources. Pricing shown on marketing
  must match what the dashboard bills — when billing goes live, generate or
  hand-sync the pricing page from the same numbers.

## Working model (humans + AI sessions)

- **One session ↔ one repo.** AI sessions are scoped to a repo; long chats
  get compacted, repos don't. Start marketing changes in a session on this
  repo, dashboard changes in a session on `thumbs-store-dashboard`.
- **Docs are the memory.** Anything a future session must know goes in
  `docs/` (this file, the design system, launch copy), not in chat history.
- **Small PRs per surface.** Marketing PRs never touch app code and vice
  versa — which two repos give you for free.

## Growth path (in order, each step independent)

1. Attach `thumbs.store` + `www` to the site project; `app` to the dashboard.
2. Search Console + Bing: submit `sitemap.xml`; finalize pricing numbers
   (the page is indexable and still wears the draft pill).
3. Blog becomes real: write posts as static pages under `site/blog/…`
   (keep zero-build; the index already exists).
4. White-label: a separate Vercel project per the wildcard-domain pattern
   (`*.partner-domain` → dashboard with tenant theming) — a dashboard-repo
   concern, not marketing.
5. Extract `render-core` / consider a monorepo only when step 4 makes the
   template maths a three-way share.

## Decisions log

- 2026-09: marketing = static `site/` in this repo; dashboard = existing
  repo/project; two repos, one Vercel team; domains per project; design
  system doc is the cross-repo contract.
- 2026-09: repo renamed `tasker` → `thumbs-store-site` to match its role
  (GitHub redirects the old name for git, web and raw URLs).
- 2026-09: marketing site hosted on **Railway**, not Vercel — the Vercel
  integration could not create projects/deployments (403s, resources rolled
  back), while Railway (already hosting the API) deployed first try.
  Project `thumbs-store-site` → service `site` builds `site/Dockerfile`
  (Caddy) from this repo's `claude/thumbs-store-landing-page-jgyuvh` branch,
  auto-deploys on push, live at https://site-production-5bbd.up.railway.app.
  The Vercel section above remains as an alternative; `vercel.json` still
  works if hosting ever moves. Domain attach: `generate-domain` with
  `thumbs.store` on this service, then the DNS records Railway returns.
