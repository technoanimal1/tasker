# White-logo workflow (standard for every game)

How every game's white logotype is produced and shown. This is the agreed
process after testing knockout / mask / matte / OCR-box / redraw across many
Pragmatic logos.

## The rule of two logo types

- **Clean logos** — letters separated by transparency (e.g. Gates of Olympus,
  Sweet Bonanza, Big Bass). A pixel **knockout** (alpha → white) gives exact
  letterforms for free.
- **Plate logos** — the title is one opaque shape / heavy outline / backing
  plate (e.g. Wild West Gold, Fruit Party, Wolf Gold, The Dog House). Any pixel
  method (knockout, EVF-SAM mask, GPT matte, OCR-box) can only produce a solid
  **white blob**, because there are no transparent gaps between the letters.

**Decision: the standard white-logo engine is the hardened GPT redraw**
(`logo-white`, `mode: "gpt"`). It traces letter contours, so it works for both
types: flat solid white, decorations removed, all text lines kept, no crop.
Knockout stays available as a free fallback for clearly-clean logos and as a
last resort when a redraw fails.

## Never show a blob (client rule)

`useFigmaAssets` no longer runs the client-side canvas knockout. White-logo
resolution is: **Figma white node → `logo_white_url` (server redraw) →
nothing**. When a game has no clean white logo yet, `Thumbnail` renders its
**colour logo** instead of a knockout blob. So an un-generated or failed game
degrades to its colourful logo, never a blob.

## The edge function: `logo-white`

`POST` body: `{ fileKey, node, slug, mode }` where `node` is the game's
`figma_logo_color_node`. Modes:

- `gpt` — **standard.** gpt-image-1 edit, `background: transparent`,
  `input_fidelity: high`, size picked by source aspect (landscape/portrait/
  square) so wide wordmarks aren't cropped. Prompt: keep every line/word, remove
  mascots/plate/background, flat pure white, no outline, keep exact shapes, small
  margin, no crop.
- `knockout` — free alpha→white; exact for clean logos, blob for plate logos.
- `ocrbox` — Florence-2 OCR word boxes → knockout inside (drops far
  decorations). Good for clean logos with stray art; blob for plate logos.
- `mask` (EVF-SAM), `gptmask`, `gptmatte` — earlier experiments, kept for
  reference; not the default.

Output is uploaded to `brand-assets/derived/white/<slug>.png` and the row's
`logo_white_url` is set to that public URL with a `?v=` cache-bust.

## Batch procedure (from SQL via pg_net — supabase/fal/openai are egress-blocked
from the assistant sandbox)

1. **Import** games from the Figma component sets — logo `13:233`
   (`game=Name, color=Yes|No`), key-visuals `13:880`, backgrounds `13:968`.
   Match `color=Yes` logo + kv + bg by game name; insert `slug, name,
   figma_file_key, figma_bg_node, figma_kv_node, figma_logo_color_node`.
2. **Generate** white logos with `mode:"gpt"`, calling the function with
   `net.http_post(..., timeout_milliseconds := 240000)`.
3. **Throttle** — Figma render and gpt-image-1 both rate-limit. Fire **≤4 at a
   time, ~60s apart**. Firing 20 at once trips 429s on both. A full ~580-game
   run must be a paced queue.
4. **Save** `logo_white_url = .../derived/white/<slug>.png?v=<tag>`.
5. **QA** — spot-check a contact sheet. Expect ~85% first-pass clean. Re-run
   failures once (stochastic ones — over-removal, wrong tint — usually clear).
   Genuine outline-font logos may keep an outline; a logo GPT keeps emptying can
   fall back to `knockout` or the colour logo.

## Cost

gpt-image-1 image edit ≈ $0.10–0.15 each. ~580 games ≈ $60–90 for a full sweep.
