# Perfect Thumbnail & Motion — Playbook

A repeatable process for producing clean, on-brand thumbnails and flawless AI
motion at scale. Follow top to bottom the first time; use the checklist after.

---

## 0. The mental model

- **One global template** drives every thumbnail. Layout params are *relative*
  (fractions / %) so a single design holds across every aspect size.
- **Three layers of control**, from broad to narrow:
  1. **Template controller** (designer, "Template" tab) → the master rules,
     per aspect size. Saving applies to **all** thumbnails.
  2. **Branch frame design** ("Frames" tab) → a client's frame that overrides
     the template for that branch.
  3. **Per-thumbnail** (Thumbnails tab, scope = the game name) → tweaks that
     affect only one thumbnail.
- Narrower always wins over broader, **per aspect size**. A per-thumbnail
  layout for `3:4` overrides only that game's `3:4`, nothing else.

---

## 1. Source assets (Figma)

Quality in = quality out. Before anything else:

- **Key visual (KV)** should be a **clean cutout of the character with its own
  transparent padding** — not touching the artboard edges. The renderer and the
  AI both respect that padding.
- Keep the KV, background, and logo on **separate nodes** so they can be
  layered, recolored, and animated independently.
- Prefer a **white logo node** where possible; if absent, the app auto-generates
  a white logotype from the colour logo.

---

## 2. Set the master template (once)

In **Template**:

1. Pick each **aspect** (3:4, 16:9, …) in turn.
2. **Logo position** — use the 5-preset bar for the common spot, or the 9-point
   grid for precision. Set **Logo size**.
3. **Key visual** — set position (9-point) and **KV size** (up to 200%).
4. **Gradient** — set the light-band placement/opacity/height **per size**
   (it can differ between portrait and landscape).
5. **Save template.** Repeat for every aspect you ship.

> Rule of thumb: design the template so **90% of games look right with zero
> per-thumbnail work**. Per-thumbnail edits are the exception, not the norm.

---

## 3. Per-thumbnail tweaks (only when needed)

In **Thumbnails**, select the game (scope shows its name):

- The **Layout** section now edits *that thumbnail's* KV/logo placement & size
  for the current aspect. Hit **Auto** to fall back to the template.
- Recolour, swap logo variant, nudge background zoom here too.
- Everything here is stored as an override and never touches other games.

---

## 4. AI motion — the perfect-loop recipe

Open a game, scroll to **Generative motion · AI**.

**Motion style — pick per clip. Every option loops perfectly** (the model's end
frame is set equal to the start frame, so the clip returns to frame 1):

| Style | Engine | When to use |
|---|---|---|
| **Smooth · fast** | Hailuo 02 Standard | Default. Gentle, natural idle motion, quickest. |
| **Smooth · high quality** | Hailuo 02 Pro | Crisper detail, a bit slower. |
| **Cinematic · most motion** | Kling Pro v1.6 | Boldest, most dynamic motion; slowest. |

| Setting | Value | Why |
|---|---|---|
| Prompt | short, describe **subtle** motion | e.g. "the dragon breathes and blinks, tail sways gently". |
| — | keep "camera locked, preserve artwork" | already appended automatically. |

**What happens under the hood (automatic, don't fight it):**

1. The KV is **letterboxed onto its nearest aspect bucket with a 10% margin** →
   the model can never crop the character's sides.
2. **Generate** → motion clip.
3. **Alpha matte** (BiRefNet, `video_output_type = VP9 (.webm)`) → transparent
   clip, no black box.
4. **Insert** → the transparent clip composites over the real background in the
   frame, everywhere the thumbnail appears.

**Prompt tips for clean loops:**
- Favour **idle / cyclic** motion (breathing, floating, shimmer, blink). These
  loop invisibly. Avoid one-way motion (walking off, a coin dropping once).
- Keep it **small** — big motion drifts the character and fights the frame.
- One or two ideas max. Over-describing yields jitter.

**Speed vs. quality:** all three styles loop; they trade speed for motion
richness. Start with **Smooth · fast**; step up only if a clip needs more life.

---

## 5. Export

- **Still:** PNG (lossless) / WebP / AVIF (smaller).
- **Animated:** "Animated (WebM)" — when a clip is inserted it records the
  transparent motion composited into the full frame (VP9, best quality / small
  size). No clip inserted → it records the procedural motion preset instead.

---

## 6. QA checklist (per thumbnail before shipping)

- [ ] Character fully inside the frame, not touching the stroke, with breathing room.
- [ ] Logo legible, correct variant (white on busy art), correct position for the aspect.
- [ ] Provider badge present, right size and spacing, not overlapping art.
- [ ] Gradient band reads cleanly — no hard seam, text/logo sits on it comfortably.
- [ ] (Animated) loop has **no jump** at the restart — watch it loop 3× at the seam.
- [ ] (Animated) background shows through the character correctly (no black box, no halo).
- [ ] Looks right at **every aspect** you ship, not just 3:4.

---

## 7. Known constraints & gotchas

- **Only end-frame models loop.** LTX / Wan-i2v / Pixverse / Kling *Standard* /
  Luma take a start frame only → they **cannot** make a true loop. End-frame
  models: **Hailuo 02** (default), Wan FLF2V, Kling Pro.
- **Perfect-loop generation is synchronous** through the edge function. Very
  long clips can approach the function's time limit; if a run times out, retry
  or draft with the fast model. (Planned upgrade: move to fal's queue + polling.)
- **Matte alpha only composites in Chromium** (`<video>` + canvas VP9 alpha).
  Fine for the app and export; other browsers may show the clip opaque.
- **Canvas export needs CORS** on the clip host (fal.media sends it). If an
  animated export ever comes out blank, it's a taint issue — route the clip
  through the image proxy.
- The AI clip URL lives on **fal.media** (not copied to Supabase); only the URL
  string is stored on the thumbnail row.

---

## 8. Secrets & ops

- The fal API key lives **only** in Supabase `app_secrets` (never in the repo or
  client). All fal calls go through the `fal-animate` edge function.
- Deploys: push to `thumbs-store-dashboard` (Vercel builds it).
