# thumbs.store — marketing site

The public marketing site for [thumbs.store](https://www.thumbs.store), deployed
on Vercel. Zero build step: plain static HTML, one file per page.

| URL | file |
| --- | --- |
| `/` | `index.html` — homepage |
| `/studio` | `studio.html` — the Studio explainer with the live editor |
| `/pricing` | `pricing.html` — credit pricing + cost calculator |
| `/blog` | `blog.html` |
| `/roadmap` | `roadmap.html` |
| `/license` | `license.html` — API License Agreement v1.3 (+ `api-license-v1.3.pdf`) |

Also ships `sitemap.xml`, `robots.txt`, `favicon.svg`, the `og.png` share card
and a branded `404.html`.

## Deploying

Vercel project **thumbs-store-landing**, framework **Other**, no build command —
the repo root is served as-is. Every push to `main` deploys automatically.
`vercel.json` provides clean URLs (`/studio` → `studio.html`), security headers
and the apex → `www` redirect.

## Editing

Each page is self-contained: its CSS lives in a `<style>` block in the file and
its behaviour in one `<script>` at the bottom. Shared design tokens, components
and rules are documented in the design system doc in the
`technoanimal1/thumbs-store-site` repo (`docs/DESIGN_SYSTEM.md`).

Pricing numbers live in one `CFG` object at the top of the script in
`pricing.html`. The Studio editor's template constants (`TEMPLATE`, `GRAD`)
mirror the renderer in the dashboard app — update them together.
