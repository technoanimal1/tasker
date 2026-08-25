// Google Fonts used for text-logo variants. Families are loaded on demand by
// injecting a <link> once, and awaited before canvas export via document.fonts.
export const FONT_OPTIONS = [
  'Poppins',
  'Montserrat',
  'Oswald',
  'Bebas Neue',
  'Anton',
  'Archivo Black',
  'Righteous',
  'Teko',
  'Rajdhani',
  'Passion One',
] as const

export type FontFamily = (typeof FONT_OPTIONS)[number]

const loaded = new Set<string>()

let measureCtx: CanvasRenderingContext2D | null = null

/**
 * Font size (px) so `text` in `family` fits inside boxW×boxH. Height drives the
 * size; if the line is wider than the box it scales down to fit. Used by both
 * the DOM preview and the canvas export so they match.
 */
export function fitFontSize(
  text: string,
  family: string,
  boxW: number,
  boxH: number,
  weight = 900,
): number {
  const target = boxH * 0.74
  if (!text || typeof document === 'undefined') return target
  measureCtx ??= document.createElement('canvas').getContext('2d')
  if (!measureCtx) return target
  measureCtx.font = `${weight} ${target}px "${family}", sans-serif`
  const w = measureCtx.measureText(text).width || 1
  return Math.max(6, target * Math.min(1, boxW / w))
}

/** Inject the Google Fonts stylesheet for a family (once). */
export function ensureFont(family: string) {
  if (!family || loaded.has(family) || typeof document === 'undefined') return
  loaded.add(family)
  const href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@400;700;900&display=swap`
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = href
  link.dataset.font = family
  document.head.appendChild(link)
}

/** Ensure the family is injected AND its glyphs are ready (for canvas export). */
export async function loadFontFace(family: string, weight = 900, sizePx = 100) {
  ensureFont(family)
  if (typeof document === 'undefined' || !('fonts' in document)) return
  try {
    await document.fonts.load(`${weight} ${sizePx}px "${family}"`)
    await document.fonts.ready
  } catch {
    /* fall back to system font */
  }
}
