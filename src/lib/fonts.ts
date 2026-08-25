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

export interface TextLogoLayout {
  fontSize: number
  lines: string[]
  lineHeight: number
}

/**
 * Lay out a game name as a text logo at a (near-)constant font size, wrapping a
 * long title onto 1–3 lines instead of shrinking it. Because the box is the same
 * for every thumbnail, the font size only varies by line count and stays within
 * ~20% across the set (1–2 lines share the max size, 3 lines are max/1.2).
 * Shared by the DOM preview and the canvas export so both match exactly.
 */
export function layoutTextLogo(
  text: string,
  family: string,
  boxW: number,
  boxH: number,
  weight = 900,
): TextLogoLayout {
  const LH = 1.04
  const MAX_LINES = 3
  const baseFs = boxH / (MAX_LINES * LH) // guarantees 3 lines fit the height
  const maxFs = baseFs * 1.2 // ≤20% larger for 1–2 line titles
  const words = (text || '').split(/\s+/).filter(Boolean)
  if (!words.length || typeof document === 'undefined') {
    return { fontSize: baseFs, lines: [text], lineHeight: LH }
  }
  measureCtx ??= document.createElement('canvas').getContext('2d')
  const ctx = measureCtx
  if (!ctx) return { fontSize: baseFs, lines: [text], lineHeight: LH }
  const measure = (s: string, fs: number) => {
    ctx.font = `${weight} ${fs}px "${family}", sans-serif`
    return ctx.measureText(s).width
  }
  // Greedy word-wrap at a given font size (no cap; caller checks line count).
  const wrap = (fs: number): string[] => {
    const lines: string[] = []
    let cur = ''
    for (const w of words) {
      const t = cur ? `${cur} ${w}` : w
      if (cur && measure(t, fs) > boxW) {
        lines.push(cur)
        cur = w
      } else {
        cur = t
      }
    }
    if (cur) lines.push(cur)
    return lines
  }
  // Fewest lines that fit width, with the font capped so sizes stay consistent.
  for (let L = 1; L <= MAX_LINES; L++) {
    const fs = Math.min(maxFs, boxH / (L * LH))
    const lines = wrap(fs)
    const widest = Math.max(...lines.map((l) => measure(l, fs)))
    if (lines.length <= L && widest <= boxW) return { fontSize: fs, lines, lineHeight: LH }
  }
  // Fallback (very long titles): 3 lines at base size, shrink only to fit width.
  let lines = wrap(baseFs)
  if (lines.length > MAX_LINES) lines = [lines[0], lines[1], lines.slice(2).join(' ')]
  const widest = Math.max(...lines.map((l) => measure(l, baseFs))) || 1
  const fs = widest > boxW ? baseFs * (boxW / widest) : baseFs
  return { fontSize: fs, lines, lineHeight: LH }
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
