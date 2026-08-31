// Thumbnail Studio model. A single global Template drives every Thumbnail.
// Layout params are RELATIVE (fractions / percentages) so one design holds
// across every frame ratio (responsive).
import type { PaletteMode } from './palettes'

export const FRAME_SIZES = [
  { key: '3:4', label: '3:4 · 900×1200', w: 900, h: 1200 },
  { key: '47:66', label: '47:66 · 940×1320', w: 940, h: 1320 },
  { key: '2:3', label: '2:3 · 800×1200', w: 800, h: 1200 },
  { key: '16:9', label: '16:9 · 1280×720', w: 1280, h: 720 },
  { key: '4:3', label: '4:3 · 1200×900', w: 1200, h: 900 },
  { key: '3:2', label: '3:2 · 1200×800', w: 1200, h: 800 },
] as const

export function frameSize(key: string) {
  return FRAME_SIZES.find((s) => s.key === key) ?? FRAME_SIZES[0]
}

/** Position a box of size w×h at a 9-point anchor inside W×H, with a % margin. */
export function alignBox(align: Align9, W: number, H: number, w: number, h: number, margin = 0.05) {
  const mx = W * margin
  const my = H * margin
  const col = align[1]
  const row = align[0]
  const x = col === 'l' ? mx : col === 'r' ? W - mx - w : (W - w) / 2
  const y = row === 't' ? my : row === 'b' ? H - my - h : (H - h) / 2
  return { x, y, w, h }
}

/** Compute key-visual and logo boxes from a per-size layout.
 *
 *  Kept for callers that need a rectangle (text logo, video layers). Image
 *  layers use `layerPlacement` instead — see that function for why. Both box
 *  dimensions follow the size slider, so the box aspect never changes with the
 *  scale (that stability is what stops the contain-fit from jumping). */
export function layoutBoxes(layout: SizeLayout, W: number, H: number) {
  const kvW = W * layout.kvScale
  const kv = anchorCenterBox(layout.kvAlign, W, H, kvW, layout.kvScale * H, layout.kvDX ?? 0, layout.kvDY ?? 0)
  const lgW = W * layout.logoScale * LOGO_ASPECT_K
  const logo = anchorCenterBox(layout.logoAlign, W, H, lgW, layout.logoScale * H, layout.logoDX ?? 0, layout.logoDY ?? 0)
  return { kv, logo }
}

/** Logos are wide, so their box is wider than the frame per unit of size. */
export const LOGO_ASPECT_K = 2.2

export interface Placement {
  /** Frame-space point the layer is pinned to (never depends on the scale). */
  ax: number
  ay: number
  /** Multiplier applied to the layer's base (frame contain-fit) size. */
  k: number
}

/** Where a layer is pinned, and how much it is scaled — the two halves kept
 *  strictly independent.
 *
 *  This is the "scale from the centre" model: the renderer lays an image out
 *  ONCE at k = 1 (a contain-fit inside the frame, computed from the image and
 *  the frame only) with its origin point on `ax`/`ay`, then scales it about
 *  that same origin. Because the anchor is scale-independent and the scaling is
 *  a transform about the pinned point, the point cannot move — at any size.
 *
 *  The old path re-solved the image's top-left from a freshly scaled box on
 *  every change, so any imprecision in the pinned point was multiplied by the
 *  rendered size and the art crept sideways as it grew. */
export function layerPlacement(
  align: Align9,
  scale: number,
  dx: number,
  dy: number,
  W: number,
  H: number,
  kind: 'kv' | 'logo',
): Placement {
  const col = align[1]
  const row = align[0]
  return {
    ax: (col === 'l' ? 0.27 : col === 'r' ? 0.73 : 0.5) * W + dx * W,
    ay: (row === 't' ? 0.32 : row === 'b' ? 0.68 : 0.5) * H + dy * H,
    // Matches the old rendered size: the KV box shares the frame aspect, and a
    // width-bound logo fitted 2.2·scale·W — so existing layouts keep their size.
    k: kind === 'kv' ? scale : scale * LOGO_ASPECT_K,
  }
}

/** Base (k = 1) contain-fit of an image inside the frame. Depends only on the
 *  image and the frame, never on the scale, so there is no fit branch that can
 *  flip mid-drag and make the art jump. */
export function baseFit(natW: number, natH: number, W: number, H: number) {
  const f = Math.min(W / natW, H / natH)
  return { w: natW * f, h: natH * f }
}

/** Place a w×h box CENTERED on the alignment's anchor point (plus a fine X/Y
 *  offset as a fraction of W/H), so changing the size grows the box symmetrically
 *  around that point — the art stays put as you resize (position is independent
 *  of size). The 9-point alignment picks the anchor; the offset nudges it. */
export function anchorCenterBox(align: Align9, W: number, H: number, w: number, h: number, dx = 0, dy = 0) {
  const col = align[1]
  const row = align[0]
  const cx = (col === 'l' ? 0.27 : col === 'r' ? 0.73 : 0.5) * W + dx * W
  const cy = (row === 't' ? 0.32 : row === 'b' ? 0.68 : 0.5) * H + dy * H
  return { x: cx - w / 2, y: cy - h / 2, w, h }
}

/** A sensible starting layout for a size, based on its orientation. */
export function defaultLayout(sizeKey: string): SizeLayout {
  const s = frameSize(sizeKey)
  const landscape = s.w / s.h > 1.2
  return landscape
    ? { kvAlign: 'ml', kvScale: 0.88, logoAlign: 'mr', logoScale: 0.44 }
    : { kvAlign: 'tc', kvScale: 0.7, logoAlign: 'bc', logoScale: 0.3 }
}

// corner-radius tokens (Figma "type" collection) expressed as a fraction of a
// 244px reference card so they scale with any frame width.
export const CORNER_MODES: Record<string, number> = { sharp: 8, friendly: 16, playful: 24 }
export const CORNER_REF = 244

export type LogoVariant = 'color' | 'white'

// 9-point alignment: [row t|m|b][col l|c|r]
export type Align9 = 'tl' | 'tc' | 'tr' | 'ml' | 'mc' | 'mr' | 'bl' | 'bc' | 'br'
export const ALIGN9: Align9[] = ['tl', 'tc', 'tr', 'ml', 'mc', 'mr', 'bl', 'bc', 'br']

/** Per-breakpoint layout: where the key visual and logo sit, and how big. */
export interface SizeLayout {
  kvAlign: Align9
  kvScale: number // key-visual height as a fraction of frame height
  logoAlign: Align9
  logoScale: number // logo box height as a fraction of frame height
  // Fine offset from the anchor point, as a fraction of frame W/H (default 0).
  kvDX?: number
  kvDY?: number
  logoDX?: number
  logoDY?: number
}
/** Which edge the light band sits on (and the direction it fades from). */
export type GradDir = 'bottom' | 'top' | 'left' | 'right'
export const GRAD_DIRS: GradDir[] = ['bottom', 'top', 'left', 'right']

/** Light-band gradient placement — can be set globally or per aspect size. */
export interface GradientParams {
  gradStop1: number
  gradStop2: number
  gradBottom: number
  gradOpacity: number
  gradBandPct: number
  /** Edge the band emanates from (default bottom). */
  gradDir: GradDir
}
export type ProviderPos = 'top' | 'bottom' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
export const PROVIDER_POSITIONS: ProviderPos[] = ['top', 'bottom', 'top-left', 'top-right', 'bottom-left', 'bottom-right']

/** How the provider badge text is cased, so mixed source names (NETENT vs
 *  Spribe) can be normalised to one consistent style across the product. */
export type ProviderCase = 'as-is' | 'upper' | 'title' | 'lower'
export const PROVIDER_CASES: ProviderCase[] = ['as-is', 'title', 'upper', 'lower']
export function applyCase(text: string, mode: ProviderCase): string {
  switch (mode) {
    case 'upper':
      return text.toUpperCase()
    case 'lower':
      return text.toLowerCase()
    case 'title':
      return text.toLowerCase().replace(/\b[\p{L}\p{N}]/gu, (c) => c.toUpperCase())
    default:
      return text
  }
}

/**
 * House style for the text logotype — the settings a text logo starts from.
 * Applied when the text-logo variant is switched on, and used as the defaults
 * for any template that hasn't set them.
 */
export const TEXT_LOGO_PRESET = {
  fontFamily: 'Bebas Neue',
  textWeight: 900, // snapped to the family's available weights at render time
  textAlign: 'center' as const,
  textColorMode: 'white' as const,
  textAllCaps: true,
  textShadow: false,
  textLetterPct: 3,
  textLineHeight: 0.88,
  textMaxLines: 3,
  textScale: 0.8,
  textFillLines: true, // vary line widths
}

export interface TemplateParams {
  sizeKey: string
  cornerMode: 'sharp' | 'friendly' | 'playful'
  palette: PaletteMode
  colorKey: string
  bgScale: number // zoom on top of cover-fill (always centered)
  kvSizePct: number // key visual height as % of frame height (bottom-anchored, centered)
  kvBottomPct: number // extra offset from the bottom, % of frame height
  kvAutoCenter: boolean // centre the KV on its visible artwork (ignore transparent padding)
  logo: { xPct: number; yPct: number; wPct: number; hPct: number }
  /** Per-breakpoint alignment layout (designer-only). Absent size = auto layout. */
  layouts?: Record<string, SizeLayout>
  logoVariant: LogoVariant
  textLogo: boolean // render the game name as text instead of the image logo
  fontFamily: string // Google Font family for the text logo
  // text-logo typography
  textWeight: number // font weight (snapped to what the family offers)
  textAlign: 'left' | 'center' | 'right'
  textColorMode: 'game' | 'white' | 'custom'
  textColor: string // used when textColorMode = 'custom'
  textAllCaps: boolean
  textShadow: boolean // drop shadow behind the text logo (off by default)
  textLetterPct: number // letter spacing, % of font size
  textLineHeight: number // line-height multiplier
  textMaxLines: number // 1..4
  textScale: number // overall size nudge on top of the auto fit
  textFillLines: boolean // scale each line to fill the box width (vary line widths)
  // frame stroke
  strokeWidth: number // px @244 ref
  strokePad: number // px @244 ref — gap between the stroke and the frame edge
  strokePos: 'inside' | 'outside' // inside = ring over art; outside = matted frame around art
  showProvider: boolean
  providerPos: ProviderPos
  providerName: string // overrides each thumbnail's provider text when non-empty
  providerCase: ProviderCase // normalise the badge text casing (default as-is)
  providerRadius: { tl: number; tr: number; br: number; bl: number } // px @244 ref, per corner
  providerPadX: number // px @244 ref
  providerPadY: number // top padding inside the badge, px @244 ref
  providerPadBottom: number // bottom padding inside the badge, px @244 ref
  providerScale: number // overall badge size multiplier (1 = default)
  providerMarginX: number // distance from the frame's side edge, px @244 ref
  providerMarginY: number // distance from the frame's top/bottom edge, px @244 ref
  // light band gradient (bg-semantic → bg-blur), stop positions in %
  gradStop1: number // top fade: transparent at 0 → full colour here
  gradStop2: number // colour crossover: semantic → blur
  gradBottom: number // bottom fade: colour holds until here → transparent at 100
  gradOpacity: number // overall band opacity 0..1
  gradBandPct: number // band height as % of frame height
  gradDir: GradDir // edge the light band sits on (bottom by default)
  /** Per-aspect-size gradient overrides; absent size falls back to the globals above. */
  gradients?: Record<string, GradientParams>
  // animation
  animEnabled: boolean
  animPreset: AnimPreset
  animSpeed: number // seconds per loop
  animIntensity: number // 0..2 (past 1 = deliberately punchy)
  animCount: number // legacy particle density (kept for old templates)
  animFx: AnimFx // per-depth particle effects
  animMo: AnimMo // per-layer motion
}

/**
 * Motion applied to one layer of the card (background / key visual / logo).
 * Each layer animates independently, so the art moves as a composition.
 */
export type MotionKind =
  | 'none' | 'float' | 'sway' | 'orbit' | 'bounce' | 'zoom' | 'wiggle' | 'heartbeat' | 'pulse' | 'kenburns' | 'shine'
export const MO_KINDS: MotionKind[] = [
  'none', 'float', 'sway', 'orbit', 'bounce', 'zoom', 'wiggle', 'heartbeat', 'pulse', 'kenburns', 'shine',
]

export interface MoLayer {
  mo: MotionKind
  intensity: number // 0..2
  /** Whole loops per animation loop. Integer so the loop stays seamless. */
  cycles: number
  /** Phase offset (0..1) — delays this layer for follow-through between layers. */
  lag: number
}
export const MO_OFF: MoLayer = { mo: 'none', intensity: 1, cycles: 1, lag: 0 }

export interface AnimMo {
  bg: MoLayer
  kv: MoLayer
  logo: MoLayer
}

/**
 * A code-drawn particle effect, applied at one depth of the card. Three of them
 * stack independently (behind the art, over the key visual, over the logo), so
 * e.g. embers can rise behind the character while coins fall in front of it.
 */
export type FxKind = 'none' | 'coins' | 'fire' | 'sparkle' | 'confetti'
export const FX_KINDS: FxKind[] = ['none', 'coins', 'fire', 'sparkle', 'confetti']

export interface FxLayer {
  fx: FxKind
  intensity: number // 0..2
  count: number // particle density
  /** Whole loops per animation loop. Integer so the loop stays seamless. */
  cycles: number
}
export const FX_OFF: FxLayer = { fx: 'none', intensity: 1, count: 26, cycles: 1 }

/** The three depths an effect can sit at. */
export interface AnimFx {
  bg: FxLayer
  kv: FxLayer
  logo: FxLayer
}
export const FX_SLOTS = ['bg', 'kv', 'logo'] as const
export type FxSlot = (typeof FX_SLOTS)[number]
export const FX_SLOT_LABEL: Record<FxSlot, string> = {
  bg: 'Behind art',
  kv: 'Over key visual',
  logo: 'Over logo',
}

export type AnimPreset =
  | 'float' | 'pulse' | 'kenburns' | 'shine' | 'zoom' | 'wiggle' | 'bounce' | 'heartbeat'
  | 'coins' | 'fire' | 'sparkle' | 'confetti'
export const ANIM_PRESETS: AnimPreset[] = [
  // motion
  'float', 'pulse', 'kenburns', 'shine', 'zoom', 'wiggle', 'bounce', 'heartbeat',
  // particles (drawn in code — no video needed)
  'coins', 'fire', 'sparkle', 'confetti',
]

export const DEFAULT_PARAMS: TemplateParams = {
  sizeKey: '3:4',
  cornerMode: 'friendly',
  palette: 'dark',
  colorKey: 'green',
  bgScale: 1.0,
  kvSizePct: 70,
  kvBottomPct: 0,
  kvAutoCenter: true,
  logo: { xPct: 0.1, yPct: 0.55, wPct: 0.8, hPct: 0.3 },
  logoVariant: 'color',
  textLogo: false,
  ...TEXT_LOGO_PRESET,
  textColor: '#ffffff',
  strokeWidth: 1.5,
  strokePad: 0,
  strokePos: 'inside',
  showProvider: true,
  providerPos: 'bottom',
  providerName: '',
  providerCase: 'as-is',
  providerRadius: { tl: 30, tr: 30, br: 30, bl: 30 },
  providerPadX: 0,
  providerPadY: 0,
  providerPadBottom: 0,
  providerScale: 1,
  providerMarginX: 10,
  providerMarginY: 10,
  gradStop1: 29.327,
  gradStop2: 74.038,
  gradBottom: 88,
  gradOpacity: 1,
  gradBandPct: 44.2,
  gradDir: 'bottom',
  animEnabled: false,
  animPreset: 'float',
  animSpeed: 3,
  animIntensity: 0.5,
  animCount: 26,
  animFx: { bg: FX_OFF, kv: FX_OFF, logo: FX_OFF },
  animMo: { bg: MO_OFF, kv: MO_OFF, logo: MO_OFF },
}

export interface Template {
  id: string
  name: string
  params: TemplateParams
  updated_at: string
}

export interface Thumbnail {
  id: string
  slug: string
  name: string
  provider: string
  accent_color: string
  bg_path: string | null
  kv_path: string | null
  logo_color_path: string | null
  logo_white_path: string | null
  // Figma-hosted source (assets resolved on demand, never copied)
  figma_file_key: string | null
  figma_bg_node: string | null
  figma_kv_node: string | null
  figma_logo_color_node: string | null
  figma_logo_white_node: string | null
  /** Server-derived white logo (alpha→white knockout / AI), if generated. */
  logo_white_url?: string | null
  /** AI-generated colour logotype override (e.g. a vertical restack), if any. */
  logo_color_url?: string | null
  /** Partial params applied on top of the global template for this thumbnail. */
  overrides: ParamOverride | null
  /** AI-generated key-visual animation (fal.ai), if any. */
  anim_video_url?: string | null
  anim_prompt?: string | null
  /** Alpha-packed H.264 MP4 rendition of the animation (public URL). Plays as a
   *  transparent video on every browser incl. iOS Safari (via <AlphaVideo>). */
  anim_alpha_path?: string | null
  /** Baked flat WebP preview for instant grid overview (CDN URL), + the render
   *  signature it was baked at, so a stale one can be detected and re-baked. */
  preview_url?: string | null
  preview_sig?: string | null
}

/** A partial set of template params (logo sub-keys are also optional). */
export type ParamOverride = Partial<Omit<TemplateParams, 'logo'>> & {
  logo?: Partial<TemplateParams['logo']>
}

/** Merge a thumbnail's overrides on top of the global template params. The
 *  per-size `layouts` and `gradients` maps are merged by size (so a thumbnail can
 *  override just its own size) rather than replacing the whole map. */
export function effectiveParams(base: TemplateParams, ov?: ParamOverride | null): TemplateParams {
  if (!ov || Object.keys(ov).length === 0) return base
  const merged: TemplateParams = { ...base, ...ov, logo: { ...base.logo, ...(ov.logo ?? {}) } }
  if (ov.layouts) merged.layouts = { ...(base.layouts ?? {}), ...ov.layouts }
  if (ov.gradients) merged.gradients = { ...(base.gradients ?? {}), ...ov.gradients }
  return merged
}

/** Keys that can be overridden per-thumbnail (subset of the editor controls). */
export const OVERRIDABLE: (keyof TemplateParams)[] = [
  'bgScale',
  'kvSizePct', 'kvBottomPct', 'kvAutoCenter',
  'logo', 'logoVariant',
  'palette', 'colorKey',
]

// ── Role-scoped editing ─────────────────────────────────────────────────────
// Designer-only: brand-defining choices set on the main template.
export const DESIGNER_KEYS: (keyof TemplateParams)[] = [
  'bgScale',
  'kvSizePct', 'kvBottomPct', 'kvAutoCenter',
  'logo',
  'palette', 'colorKey',
]
// Frame design: what a client may customise on their own branch.
export const FRAME_DESIGN_KEYS: (keyof TemplateParams)[] = [
  'sizeKey', 'cornerMode',
  'strokeWidth', 'strokePad', 'strokePos',
  'showProvider', 'providerPos', 'providerName', 'providerCase', 'providerRadius', 'providerPadX', 'providerPadY', 'providerPadBottom',
  'providerScale', 'providerMarginX', 'providerMarginY',
  'gradStop1', 'gradStop2', 'gradBottom', 'gradOpacity', 'gradBandPct', 'gradients',
  'logoVariant', 'textLogo', 'fontFamily',
  'textWeight', 'textAlign', 'textColorMode', 'textColor', 'textAllCaps', 'textShadow',
  'textLetterPct', 'textLineHeight', 'textMaxLines', 'textScale', 'textFillLines',
  'animEnabled', 'animPreset', 'animSpeed', 'animIntensity', 'animCount', 'animFx', 'animMo',
]

/** Keep only the frame-design keys from an arbitrary params bag (never `logo`). */
export function pickFrameParams(
  fp: Partial<TemplateParams> | ParamOverride | null | undefined,
): Partial<TemplateParams> {
  const out: Record<string, unknown> = {}
  for (const k of FRAME_DESIGN_KEYS) if (fp && k in fp) out[k] = (fp as Record<string, unknown>)[k]
  return out as Partial<TemplateParams>
}

/** Composite the main template with a branch's frame-design overrides. */
export function branchParams(
  main: TemplateParams,
  fp: Partial<TemplateParams> | ParamOverride | null | undefined,
): TemplateParams {
  return { ...main, ...pickFrameParams(fp) }
}

/** Resolved image URLs for a thumbnail's four layers. */
export interface AssetUrls {
  bg?: string
  kv?: string
  logoColor?: string
  logoWhite?: string
  /** Matted (transparent) AI motion clip that replaces the static key visual. */
  animVideo?: string
  /** Alpha-packed MP4 rendition of the motion clip (transparent everywhere,
   *  incl. iOS Safari). Preferred over `animVideo` when present. */
  animAlpha?: string
}

/** Gradient params for the active size — a per-size override wins over the globals. */
export function resolveGrad(p: TemplateParams): GradientParams {
  const g = p.gradients?.[p.sizeKey]
  return {
    gradStop1: g?.gradStop1 ?? p.gradStop1,
    gradStop2: g?.gradStop2 ?? p.gradStop2,
    gradBottom: g?.gradBottom ?? p.gradBottom,
    gradOpacity: g?.gradOpacity ?? p.gradOpacity,
    gradBandPct: g?.gradBandPct ?? p.gradBandPct,
    gradDir: g?.gradDir ?? p.gradDir ?? 'bottom',
  }
}

export function withDefaults(p: Partial<TemplateParams> | null | undefined): TemplateParams {
  const pr = p?.providerRadius as unknown
  const providerRadius =
    typeof pr === 'number'
      ? { tl: pr, tr: pr, br: pr, bl: pr }
      : { ...DEFAULT_PARAMS.providerRadius, ...((pr as object) ?? {}) }
  // Effect layers: fill in any missing field per slot. A template from before
  // the layers existed carried its particle effect on animPreset, drawn above
  // the logo — migrate it to that slot so it keeps looking the same.
  const legacy = p?.animPreset as string | undefined
  const migrated: Partial<AnimFx> =
    !p?.animFx && legacy && FX_KINDS.includes(legacy as FxKind) && legacy !== 'none'
      ? { logo: { fx: legacy as FxKind, intensity: p?.animIntensity ?? 1, count: p?.animCount ?? 26, cycles: 1 } }
      : {}
  const srcFx = { ...(p?.animFx ?? {}), ...migrated } as Partial<AnimFx>
  const animFx: AnimFx = {
    bg: { ...FX_OFF, ...(srcFx.bg ?? {}) },
    kv: { ...FX_OFF, ...(srcFx.kv ?? {}) },
    logo: { ...FX_OFF, ...(srcFx.logo ?? {}) },
  }
  // Motion layers. A template from before per-layer motion carried one preset
  // for the whole card — move it to the layer it mostly drove, so it keeps
  // looking the same: kenburns was a background push, pulse/shine sat on the
  // logo, everything else moved the key visual.
  const legacyMo = p?.animPreset as MotionKind | undefined
  const legacySlot: FxSlot | null =
    !p?.animMo && legacyMo && MO_KINDS.includes(legacyMo) && legacyMo !== 'none'
      ? legacyMo === 'kenburns'
        ? 'bg'
        : legacyMo === 'pulse' || legacyMo === 'shine'
          ? 'logo'
          : 'kv'
      : null
  const srcMo = { ...(p?.animMo ?? {}) } as Partial<AnimMo>
  if (legacySlot) srcMo[legacySlot] = { mo: legacyMo!, intensity: p?.animIntensity ?? 1, cycles: 1, lag: 0 }
  const animMo: AnimMo = {
    bg: { ...MO_OFF, ...(srcMo.bg ?? {}) },
    kv: { ...MO_OFF, ...(srcMo.kv ?? {}) },
    logo: { ...MO_OFF, ...(srcMo.logo ?? {}) },
  }
  return {
    ...DEFAULT_PARAMS,
    ...(p ?? {}),
    logo: { ...DEFAULT_PARAMS.logo, ...(p?.logo ?? {}) },
    providerRadius,
    animFx,
    animMo,
  }
}

/**
 * Colour stops for the light band. Fades in from transparent at the top (to full
 * colour at gradStop1), crosses semantic→blur at gradStop2, holds until gradBottom,
 * then fades back to transparent at the bottom. Overall alpha = gradOpacity.
 */
export function bandStops(
  semantic: string,
  blur: string,
  p: Pick<TemplateParams, 'gradStop1' | 'gradStop2' | 'gradBottom' | 'gradOpacity'>,
): { offset: number; color: string }[] {
  const clamp01 = (n: number) => Math.max(0, Math.min(1, n))
  const a = clamp01(p.gradOpacity)
  const semA = colorAlpha(semantic) * a // preserve the tint's own translucency
  const blurA = colorAlpha(blur) * a
  const s1 = clamp01(p.gradStop1 / 100)
  const s2 = clamp01(p.gradStop2 / 100)
  const sb = clamp01(p.gradBottom / 100)
  const lo = Math.min(s1, s2)
  const hi = Math.max(s1, s2)
  const bot = Math.max(hi, sb)
  // smootherstep: zero 1st AND 2nd derivative at both ends → the point where the
  // band reaches full opacity is imperceptible (no seam).
  const smooth = (t: number) => t * t * t * (t * (t * 6 - 15) + 10)
  const N = 12
  const stops: { offset: number; color: string }[] = []
  // top fade: fully transparent → the tint's own alpha, eased over 0..lo
  for (let i = 0; i <= N; i++) {
    const t = i / N
    stops.push({ offset: lo * t, color: hexA(semantic, semA * smooth(t)) })
  }
  // colour crossover semantic → blur, lo..hi
  stops.push({ offset: hi, color: hexA(blur, blurA) })
  // hold, then bottom fade: → fully transparent, eased over bot..1
  stops.push({ offset: bot, color: hexA(blur, blurA) })
  for (let i = 1; i <= N; i++) {
    const t = i / N
    stops.push({ offset: bot + (1 - bot) * t, color: hexA(blur, blurA * smooth(1 - t)) })
  }
  return stops
}

/** Return `color` with its alpha replaced by `alpha`. Handles #RGB, #RRGGBB,
 *  rgb(), and rgba() — so translucent palette colours fade correctly. */
export function hexA(color: string, alpha: number): string {
  const c = color.trim()
  const rgb = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*[\d.]+\s*)?\)$/i.exec(c)
  if (rgb) return `rgba(${+rgb[1]},${+rgb[2]},${+rgb[3]},${alpha})`
  const six = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(c)
  if (six) return `rgba(${parseInt(six[1], 16)},${parseInt(six[2], 16)},${parseInt(six[3], 16)},${alpha})`
  const three = /^#?([a-f\d])([a-f\d])([a-f\d])$/i.exec(c)
  if (three) return `rgba(${parseInt(three[1] + three[1], 16)},${parseInt(three[2] + three[2], 16)},${parseInt(three[3] + three[3], 16)},${alpha})`
  return c
}

/** The alpha channel already baked into a colour string (1 for opaque hex). */
export function colorAlpha(color: string): number {
  const m = /^rgba?\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\s*\)$/i.exec(color.trim())
  return m ? Math.max(0, Math.min(1, parseFloat(m[1]))) : 1
}
