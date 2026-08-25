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
  bgScale: number // ≥1 zoom on top of cover-fill
  bgOffsetXPct: number
  bgOffsetYPct: number
  kvSizePct: number // key visual height as % of frame height (bottom-anchored, centered)
  kvBottomPct: number // extra offset from the bottom, % of frame height
  logo: { xPct: number; yPct: number; wPct: number; hPct: number }
  logoVariant: LogoVariant
  showProvider: boolean
}

export const DEFAULT_PARAMS: TemplateParams = {
  sizeKey: '3:4',
  cornerMode: 'friendly',
  palette: 'dark',
  colorKey: 'green',
  bgScale: 1.0,
  bgOffsetXPct: 0,
  bgOffsetYPct: 0,
  kvSizePct: 70,
  kvBottomPct: 0,
  logo: { xPct: 0.1, yPct: 0.55, wPct: 0.8, hPct: 0.3 },
  logoVariant: 'color',
  showProvider: true,
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
  'bgScale', 'bgOffsetXPct', 'bgOffsetYPct',
  'kvSizePct', 'kvBottomPct',
  'logo', 'logoVariant',
  'palette', 'colorKey',
]

/** Resolved image URLs for a thumbnail's four layers. */
export interface AssetUrls {
  bg?: string
  kv?: string
  logoColor?: string
  logoWhite?: string
}

export function withDefaults(p: Partial<TemplateParams> | null | undefined): TemplateParams {
  return {
    ...DEFAULT_PARAMS,
    ...(p ?? {}),
    logo: { ...DEFAULT_PARAMS.logo, ...(p?.logo ?? {}) },
  }
}

export function hexA(hex: string, alpha: number): string {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim())
  if (!m) return hex
  return `rgba(${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)},${alpha})`
}
