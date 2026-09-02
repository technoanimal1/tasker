# thumbs.store — web design system

The design language used on `landing-et.html` and `pricing-et.html`.
Monochrome-first, pure black, Inter, rounded-full pills, thin rings. Colour is
rationed: yellow is the brand's one loud voice, blue means "selected", green
means "success/free". Everything else is white at different opacities.

---

## 1. Principles

1. **Pure black, open space.** No page background other than `#000`. Sections
   are not boxed — they breathe on the black with ~130–150px between them.
   Cards exist only where content is a *product object* (a plan, a benefit, a
   media stage), never as a section wrapper.
2. **Monochrome by default.** Text, icons, borders and fills are white at a
   handful of fixed opacities. If something needs emphasis, make it *whiter*
   or *bolder* — not coloured.
3. **One yellow per screen.** `#FEF150` appears once per viewport at most: a
   draft/save pill, the hover state of the primary button, the final CTA, a
   LIVE badge. Never body text, never borders, never two yellows side by side.
4. **Pills everywhere.** Buttons, chips, badges, toggles, sliders' thumbs,
   pack "−20%" tags — all `border-radius: 999px`. Big containers use large
   soft radii (24–33px). Nothing in between.
5. **Real content, mock chrome.** Product mocks (editor, dashboard) use the
   real renderer maths and real numbers; their window chrome is minimal —
   three grey dots, a quiet title, a pill on the right.

---

## 2. Tokens

```css
:root {
  /* colour */
  --page:   #000000;                  /* the only page background */
  --panel:  #121212;                  /* card fill */
  --deep:   #0a0a0a;                  /* wells: media stages, calc output, dashboard */
  --ring:   #222222;                  /* card & table borders (1px) */
  --line:   rgb(255 255 255 / 0.08);  /* hairlines inside components */

  --text:   #ffffff;                  /* headings, emphasized values */
  --muted:  rgb(255 255 255 / 0.62);  /* body copy, list items */
  --dim:    rgb(255 255 255 / 0.4);   /* labels, captions, footers */

  --yellow: #fef150;                  /* brand accent — see rationing rule */
  --blue:   #2c5cff;                  /* selection / interactive accent (editor) */
  --green:  #7ed321;                  /* success, "free", 200 OK */

  /* type */
  --sans: 'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif;
  --mono: ui-monospace, 'SF Mono', Menlo, Consolas, monospace; /* numbers & code only */

  /* shape */
  --r-pill: 999px;   /* buttons, chips, badges, toggles */
  --r-card: 24px;    /* standard cards, media panels: 24–28px */
  --r-hero: 33px;    /* biggest containers: plans, calculator, dashboard */
}
```

Extra fixed opacities used for interactive surfaces:

| use | value |
| --- | --- |
| secondary button fill | `rgb(255 255 255 / 0.06)` (hover `0.12`) |
| secondary button ring | inset `rgb(255 255 255 / 0.16)` |
| chip / seg border | `rgb(255 255 255 / 0.16)` |
| hover border on cards | `rgb(255 255 255 / 0.28)` |
| numbered-circle ring | `rgb(255 255 255 / 0.85)` |
| bar-chart rest fill | `rgb(255 255 255 / 0.22)` |

---

## 3. Typography

Inter only. Weight and size do the hierarchy; colour only separates
text/muted/dim.

| role | spec |
| --- | --- |
| Hero H1 | 600 · `clamp(38px, 5vw, 68px)` · letter-spacing −0.04em · line-height 1.05 · `text-wrap: balance` |
| Section H2 | 600 · `clamp(30px, 3.2vw, 46px)` · −0.03em · 1.12 · centered |
| Card/step H2 | 600 · `clamp(26px, 2.5vw, 36px)` · −0.03em · 1.15 |
| Card H3 | 600 · 16–20px · −0.01em |
| Eyebrow / section label | 600 · 13px · UPPERCASE · letter-spacing 0.14em · `--dim` · centered |
| Small label (step-tag, table group) | 600 · 12px · UPPERCASE · 0.12em · `--dim` |
| Body / lede | 400–500 · 16–17px · 1.6 · `--muted` · max-width 640px when centered |
| List / card copy | 400 · 13.5–14px · 1.45–1.6 · `--muted` |
| Caption / footnote | 400 · 11–13px · `--dim` |
| Big number (price, stat) | 700 · 34–46px · −0.03em · line-height 1 |
| Data / code | `--mono` · 11–15px · 700 for values |

Rules: headlines never uppercase; labels always uppercase with wide tracking;
negative tracking scales with size (bigger = tighter); `text-wrap: balance` on
every centered headline.

---

## 4. Layout & spacing

- Column: `max-width: 1270px; margin: 0 auto; padding: 0 24px` (20px on phones).
- Section rhythm: main is a flex column with `gap: 130–150px` (90–100px < 810px).
- Page top padding: 140–150px (fixed nav is ~64px tall).
- Inside a section: hgroup (eyebrow → H2 → lede, `gap: 16px`, centered) then
  content with `margin-top: 44–48px`.
- Split rows (copy + media): `display: flex; gap: clamp(32px, 5vw, 72px)`,
  alternate direction per section (`:nth-of-type(even) { flex-direction: row-reverse }`).
- Card grids: `gap: 12–16px`.
- Breakpoints: **1199.98px** (grids halve, split rows stack and center) and
  **809.98px** (everything single-column, section gap 90–100px, secondary nav
  items hidden).

---

## 5. Components

### Buttons — always pills
```css
.btn { display:inline-flex; align-items:center; justify-content:center; gap:8px;
  padding:12px 24px; border-radius:999px; border:0; font:600 14px/1 var(--sans);
  letter-spacing:-0.01em; cursor:pointer; white-space:nowrap;
  transition:background .2s ease, filter .2s ease; }
.btn-primary   { background:#fff; color:#000; }
.btn-primary:hover { background:var(--yellow); }     /* the signature move */
.btn-secondary { color:#fff; background:rgb(255 255 255/.06);
  box-shadow:inset 0 0 0 1px rgb(255 255 255/.16); backdrop-filter:blur(5px); }
.btn-secondary:hover { background:rgb(255 255 255/.12); }
/* final-CTA variant: yellow fill, black text, brightness(1.06) on hover */
```
Nav buttons shrink to `padding: 9px 18px; font-size: 13px`.

### Chips
```css
.chip { font:600 11px/1 var(--sans); letter-spacing:.08em; text-transform:uppercase;
  color:var(--muted); border:1px solid rgb(255 255 255/.16);
  border-radius:999px; padding:5px 13px; }
.chip.on, .chip[aria-pressed='true'] { color:#000; background:#fff; border-color:#fff; }
```
Active state is white-fill/black-text — never yellow.

### Badges
Small pill, `font: 700 9–11px`, white bg / black text. Yellow version reserved
for one special badge per screen (DRAFT, LIVE, Save 20%, the savings result).

### Numbered circle (process steps)
```css
.step-num { display:inline-flex; align-items:center; justify-content:center;
  width:34px; height:34px; border-radius:999px;
  border:1px solid rgb(255 255 255/.85); color:#fff; font:600 13px/1 var(--sans); }
/* sits inside a 12px uppercase dim label, gap 12px */
```

### Cards
```css
.card    { border:1px solid var(--ring); border-radius:24px; background:var(--panel);
  padding:24px; transition:transform .25s ease, border-color .25s ease; }
.card:hover { transform:translateY(-4px); border-color:rgb(255 255 255/.28); }
.card-lg { border-radius:33px; padding:30px 28px; }   /* plans, calculator, dashboard */
/* highlighted card (e.g. popular plan): border-color rgb(255 255 255/.85)
   + a white pill tag overlapping the top edge */
```

### Media stage / well
Dark inset area that holds a demo or visual:
`background: var(--deep); border: 1px solid var(--ring); border-radius: 28px;
min-height: 340px; display: grid; place-items: center;` plus a subtle depth
overlay: `linear-gradient(to bottom, rgb(0 0 0/.35), transparent 20%,
transparent 80%, rgb(0 0 0/.35))` as a non-interactive `::after`.

### Toggle switch
48×26px pill, 1px ring, thumb 20px. Off: track `rgb(255 255 255/.08)`, white
thumb. On: track **white**, thumb **black**. Never a coloured toggle.

### Slider
```css
input[type='range'] { appearance:none; height:5px; border-radius:999px;
  background:linear-gradient(90deg, #fff 0 var(--fill,50%), #26262b var(--fill,50%) 100%); }
/* thumb: 16px white circle, small black drop shadow.
   JS keeps --fill = (value-min)/(max-min)*100% */
```
Inside the editor widget the fill/selection accent is `--blue` instead of white.

### Marquee / ticker
Not a card — a full-width strip with only `border-top` and `border-bottom`
hairlines. Content: 13px · 600 · UPPERCASE · 0.12em, items `--muted`,
separators (`·`) at `rgb(255 255 255 / 0.22)`. `animation: slide 36s linear
infinite` on a duplicated track.

### Table (feature matrix)
Wrapped in a `--panel` card (`border-radius: 24px; overflow-x: auto`).
Rows separated by `rgb(255 255 255/.06)` hairlines; group rows are 10px
uppercase dim labels with extra top padding; ✓ is white/700, "—" is
`rgb(255 255 255/.2)`; row hover `rgb(255 255 255/.025)`.

### Dashboard widgets
- **Window chrome:** panel header bar with three 9px `#2a2a2e` dots, a quiet
  12px title, a pill month-selector pushed right.
- **Credit ring:** `conic-gradient(#fff 0 var(--used), rgb(255 255 255/.08) 0)`,
  inner disc of the well colour; big mono number inside.
- **Bars:** flex row of `<i>`, height via `--h`, rest fill `rgb(255 255 255/.22)`,
  every 4th bar solid white; grow-in with per-bar 50ms delays.
- **Feed rows:** 12px rows with mono values right-aligned, hairline dividers,
  staggered fade-in from the left.

---

## 6. Motion

- **Reveal on scroll:** `opacity 0 → 1`, `translateY(18px) → 0`, 0.7s ease,
  via IntersectionObserver (`threshold 0.1`, `rootMargin 0 0 -8% 0`).
- **Hover:** cards lift `-4px` + border brightens; tiles lift `-6px scale(1.03)`.
- Standard easing `cubic-bezier(0.2, 0.7, 0.2, 1)` for anything springy;
  0.2s for colour, 0.25s for transforms, 0.6–0.9s for staged entrances.
- Looping demo animations: 4.5–16s cycles, staggered with `animation-delay`.
- **Always** provide a `prefers-reduced-motion` block: kill all animation and
  force every appear-by-animation element to its final visible state
  (`opacity: 1 !important` etc.) — otherwise they stay invisible.

---

## 7. Colour usage rules

| colour | allowed | never |
| --- | --- | --- |
| `--yellow` #FEF150 | brand mark, ONE badge/CTA per screen, primary-button hover, `::selection` | body text, borders, two uses in one viewport |
| `--blue` #2C5CFF | selection boxes/handles, editor slider fill, focus accents inside tools | marketing surfaces, buttons |
| `--green` #7ED321 | "free", MATCHED, 200 OK, savings context | decoration |
| white opacities | everything else | — |

`::selection { background: var(--yellow); color: #050505; }`
`:focus-visible { outline: 2px solid #fff; outline-offset: 3px; }`

---

## 8. Nav & footer

- Nav: fixed, full-width, `rgb(0 0 0/.72)` + `backdrop-filter: blur(14px)`,
  1px bottom hairline; inner row max-width 1270px, `padding: 14px 24px`.
  Left: the untouched brand SVG lockup. Right: 13px text links (`--muted`,
  white on hover) then secondary + primary pill buttons. Below 810px only the
  primary button survives.
- Footer: `border-top` hairline, `padding: 36px 0 56px`, 13px `--dim`,
  links gain white on hover.

---

## 9. Do / don't

- **Do** keep numbers in `--mono` (prices, credits, coordinates) — it reads
  "tool", not "brochure".
- **Do** cap any decorative absolutely-positioned glow at `min(720px, 94vw)`
  — open sections have no overflow clipping.
- **Do** use `text-wrap: balance` on centered headlines.
- **Don't** wrap sections in cards; **don't** mix radii (pill or 24/33 only);
- **Don't** redraw the logo — the SVG paths are pasted verbatim, always.
- **Don't** introduce a second accent; if it needs colour, it's probably
  yellow's one slot or it should be white.

---

*Reference implementations: `public/landing-et.html`, `public/pricing-et.html`.*
