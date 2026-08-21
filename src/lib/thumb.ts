// Thumbnail Studio — the "control area" model.
// A single global Template drives the layout of every Thumbnail at once.

export const CARD_W = 244
export const CARD_H = 324

export interface TemplateParams {
  bgScale: number // background cover scale (1 = fill card)
  bgOffsetX: number
  bgOffsetY: number
  kvScale: number // key-visual scale (centered)
  kvOffsetY: number
  logo: { x: number; y: number; w: number; h: number }
  logoVariant: 'color' | 'white'
  cornerRadius: number
  showProvider: boolean
}

export const DEFAULT_PARAMS: TemplateParams = {
  bgScale: 1.0,
  bgOffsetX: 0,
  bgOffsetY: 0,
  kvScale: 1.0,
  kvOffsetY: 0,
  logo: { x: 24, y: 180, w: 196, h: 120 },
  logoVariant: 'color',
  cornerRadius: 16,
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
}

/** Merge stored params over defaults so missing keys never break rendering. */
export function withDefaults(p: Partial<TemplateParams> | null | undefined): TemplateParams {
  return {
    ...DEFAULT_PARAMS,
    ...(p ?? {}),
    logo: { ...DEFAULT_PARAMS.logo, ...(p?.logo ?? {}) },
  }
}

/** hex (#rrggbb) → rgba() string with the given alpha. */
export function hexA(hex: string, alpha: number): string {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim())
  if (!m) return hex
  const r = parseInt(m[1], 16)
  const g = parseInt(m[2], 16)
  const b = parseInt(m[3], 16)
  return `rgba(${r},${g},${b},${alpha})`
}
