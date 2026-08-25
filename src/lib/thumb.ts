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

// corner-radius tokens (Figma "type" collection) expressed as a fraction of a
// 244px reference card so they scale with any frame width.
export const CORNER_MODES: Record<string, number> = { sharp: 8, friendly: 16, playful: 24 }
export const CORNER_REF = 244

export type LogoVariant = 'color' | 'white'

export interface TemplateParams {
  sizeKey: string
  cornerMode: 'sharp' | 'friendly' | 'playful'
  palette: PaletteMode
  colorKey: string
  bgScale: number // zoom on top of cover-fill (always centered)
  kvSizePct: number // key visual height as % of frame height (bottom-anchored, centered)
  kvBottomPct: number // extra offset from the bottom, % of frame height
  logo: { xPct: number; yPct: number; wPct: number; hPct: number }
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
  showProvider: boolean
  providerPos: 'top' | 'bottom'
  providerRadius: { tl: number; tr: number; br: number; bl: number } // px @244 ref, per corner
  providerPadX: number // px @244 ref
  providerPadY: number
  // light band gradient (bg-semantic → bg-blur), stop positions in %
  gradStop1: number // top fade: transparent at 0 → full colour here
  gradStop2: number // colour crossover: semantic → blur
  gradBottom: number // bottom fade: colour holds until here → transparent at 100
  gradOpacity: number // overall band opacity 0..1
  gradBandPct: number // band height as % of frame height
  // animation
  animEnabled: boolean
  animPreset: AnimPreset
  animSpeed: number // seconds per loop
  animIntensity: number // 0..1
}

export type AnimPreset = 'float' | 'pulse' | 'kenburns' | 'shine'
export const ANIM_PRESETS: AnimPreset[] = ['float', 'pulse', 'kenburns', 'shine']

export const DEFAULT_PARAMS: TemplateParams = {
  sizeKey: '3:4',
  cornerMode: 'friendly',
  palette: 'dark',
  colorKey: 'green',
  bgScale: 1.0,
  kvSizePct: 70,
  kvBottomPct: 0,
  logo: { xPct: 0.1, yPct: 0.55, wPct: 0.8, hPct: 0.3 },
  logoVariant: 'color',
  textLogo: false,
  fontFamily: 'Poppins',
  textWeight: 900,
  textAlign: 'center',
  textColorMode: 'game',
  textColor: '#ffffff',
  textAllCaps: true,
  textShadow: false,
  textLetterPct: 1,
  textLineHeight: 1.04,
  textMaxLines: 3,
  textScale: 1,
  textFillLines: false,
  showProvider: true,
  providerPos: 'bottom',
  providerRadius: { tl: 30, tr: 30, br: 30, bl: 30 },
  providerPadX: 0,
  providerPadY: 0,
  gradStop1: 29.327,
  gradStop2: 74.038,
  gradBottom: 88,
  gradOpacity: 1,
  gradBandPct: 44.2,
  animEnabled: false,
  animPreset: 'float',
  animSpeed: 3,
  animIntensity: 0.5,
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
  /** Partial params applied on top of the global template for this thumbnail. */
  overrides: ParamOverride | null
}

/** A partial set of template params (logo sub-keys are also optional). */
export type ParamOverride = Partial<Omit<TemplateParams, 'logo'>> & {
  logo?: Partial<TemplateParams['logo']>
}

/** Merge a thumbnail's overrides on top of the global template params. */
export function effectiveParams(base: TemplateParams, ov?: ParamOverride | null): TemplateParams {
  if (!ov || Object.keys(ov).length === 0) return base
  return { ...base, ...ov, logo: { ...base.logo, ...(ov.logo ?? {}) } }
}

/** Keys that can be overridden per-thumbnail (subset of the editor controls). */
export const OVERRIDABLE: (keyof TemplateParams)[] = [
  'bgScale',
  'kvSizePct', 'kvBottomPct',
  'logo', 'logoVariant',
  'palette', 'colorKey',
]

// ── Role-scoped editing ─────────────────────────────────────────────────────
// Designer-only: brand-defining choices set on the main template.
export const DESIGNER_KEYS: (keyof TemplateParams)[] = [
  'bgScale',
  'kvSizePct', 'kvBottomPct',
  'logo',
  'palette', 'colorKey',
]
// Frame design: what a client may customise on their own branch.
export const FRAME_DESIGN_KEYS: (keyof TemplateParams)[] = [
  'sizeKey', 'cornerMode',
  'showProvider', 'providerPos', 'providerRadius', 'providerPadX', 'providerPadY',
  'gradStop1', 'gradStop2', 'gradBottom', 'gradOpacity', 'gradBandPct',
  'logoVariant', 'textLogo', 'fontFamily',
  'textWeight', 'textAlign', 'textColorMode', 'textColor', 'textAllCaps', 'textShadow',
  'textLetterPct', 'textLineHeight', 'textMaxLines', 'textScale', 'textFillLines',
  'animEnabled', 'animPreset', 'animSpeed', 'animIntensity',
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
}

export function withDefaults(p: Partial<TemplateParams> | null | undefined): TemplateParams {
  const pr = p?.providerRadius as unknown
  const providerRadius =
    typeof pr === 'number'
      ? { tl: pr, tr: pr, br: pr, bl: pr }
      : { ...DEFAULT_PARAMS.providerRadius, ...((pr as object) ?? {}) }
  return {
    ...DEFAULT_PARAMS,
    ...(p ?? {}),
    logo: { ...DEFAULT_PARAMS.logo, ...(p?.logo ?? {}) },
    providerRadius,
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
  // top fade: transparent → full semantic, eased over 0..lo
  for (let i = 0; i <= N; i++) {
    const t = i / N
    stops.push({ offset: lo * t, color: hexA(semantic, a * smooth(t)) })
  }
  // colour crossover semantic → blur (both full alpha), lo..hi
  stops.push({ offset: hi, color: hexA(blur, a) })
  // hold, then bottom fade: full → transparent, eased over bot..1
  stops.push({ offset: bot, color: hexA(blur, a) })
  for (let i = 1; i <= N; i++) {
    const t = i / N
    stops.push({ offset: bot + (1 - bot) * t, color: hexA(blur, a * smooth(1 - t)) })
  }
  return stops
}

export function hexA(hex: string, alpha: number): string {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim())
  if (!m) return hex
  return `rgba(${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)},${alpha})`
}
