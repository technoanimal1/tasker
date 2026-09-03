# CLAUDE.md — thumbs.store Studio (project memory)

Persistent context for this repo. Keep this file up to date as the source of
truth for anyone (human or Claude) picking up work on the thumbs.store Studio.

## Product

**thumbs.store** — a web app where users find casino game **thumbnails**,
**purchase** them, and **explore** them by game **provider**. Owner: Guga
(`guga@phase.design`) — a designer, first-time "vibe coder" (pro at design,
new to building). Prefer strong visual/design quality in anything produced.

## This repo = the Studio / Dashboard

This repository is the **Design Studio (dashboard)** — the internal tool that
produces per-client design deliverables from a shared set of brand assets.

- **GitHub:** `technoanimal1/thumbs-store-dashboard` (this is where deploys come
  from). Note: it is sometimes cloned locally under the name `tasker`.
- **Stack:** Vite + React + TypeScript + Tailwind CSS. No canvas library —
  the frame builder and PNG export are hand-rolled.
- **Backend:** Supabase project `thumbs-store`
  (`https://udvbjvwavgrjwsziqtxl.supabase.co`). Tables: `brand_assets`,
  `branches`, `frames`. Public storage bucket `brand-assets`.
- **Auth:** email + password. Internal team tool (RLS: any authed user manages
  the design data).

Core model: shared brand assets (background / key visual / logo) referenced
*by kind*, arranged into sized **frames**, organized on **branches** (fork a
branch per client; assets stay shared, layouts diverge).

## Deployment (Vercel)

- **Vercel team:** `personal` (`personal-1c87f55a` /
  `team_vbQxKf5z3LMKElH22rc4DP2e`), Pro plan, owner `guga@phase.design`.
- **Project:** `thumbs-store-dashboard` (`prj_W0qEPrAbTii07KH15Lx3ngABXXjY`),
  framework **vite**, Node 24.x, auto-deploys from `main`.
- **Domains:** only default `*.vercel.app` so far — no custom domain yet.
- Repo still contains a leftover `netlify.toml` from an earlier Netlify setup.

### Domain plan (decided with Guga)

- Guga **owns `thumbs.store`**.
- **Root `thumbs.store` → the landing site** (marketing).
- **Dashboard/Studio → a subdomain** (e.g. `app.thumbs.store`).
- Target end state: **2 Vercel projects** — one landing, one dashboard —
  cleaned up from a larger set that currently exists on Guga's Vercel.

> ⚠️ Open item: Guga wants ~4 Vercel projects (all on the `personal` team)
> collapsed to 2 (landing + dashboard). Diagnosed 2026-09-03: the in-chat Vercel
> connection is **project-scoped to `thumbs-store-dashboard`** — `list_projects`
> returns only that one, and probing `thumbs.store` returns **401 Unauthorized**
> (it exists but this connection can't access it). Cleanup is blocked until the
> Vercel connector is re-authorized with **team-wide / all-projects** access.
> Confirmed projects so far: `thumbs-store-dashboard` (accessible),
> `thumbs.store` (exists, unauthorized).

## Working preferences

- Develop on the assigned feature branch; commit with clear messages; push.
- Design quality matters — treat this like a design product, not just code.
