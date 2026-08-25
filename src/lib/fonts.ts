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
  'Changa One',
  'Bungee',
  'Luckiest Guy',
] as const

export type FontFamily = (typeof FONT_OPTIONS)[number]

// Weights Google actually serves per family — requesting an unavailable weight
// makes the whole css2 stylesheet 400, so we only ever ask for these.
const FONT_WEIGHTS: Record<string, number[]> = {
  Poppins: [400, 500, 600, 700, 800, 900],
  Montserrat: [400, 500, 600, 700, 800, 900],
  Oswald: [400, 500, 600, 700],
  'Bebas Neue': [400],
  Anton: [400],
  'Archivo Black': [400],
  Righteous: [400],
  Teko: [400, 500, 600, 700],
  Rajdhani: [400, 500, 600, 700],
  'Passion One': [400, 700, 900],
  'Changa One': [400],
  Bungee: [400],
  'Luckiest Guy': [400],
}

export const WEIGHT_OPTIONS = [400, 500, 600, 700, 800, 900]

/** Snap a requested weight to the nearest one the family actually offers. */
export function snapWeight(family: string, weight: number): number {
  const avail = FONT_WEIGHTS[family] ?? [400, 700]
  return avail.reduce((best, w) => (Math.abs(w - weight) < Math.abs(best - weight) ? w : best), avail[0])
}

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
  fontSize: number // base size (used when lines are uniform)
  lines: string[]
  lineSizes: number[] // per-line font size (== fontSize unless fillLines)
  lineHeight: number
}

export interface TextLogoOpts {
  weight?: number
  maxLines?: number
  lineHeight?: number
  scale?: number // overall size nudge
  fillLines?: boolean // scale each line to fill the box width
  allCaps?: boolean
}

/**
 * Lay out a game name as a text logo at a (near-)constant size, wrapping a long
 * title onto up to `maxLines` lines instead of shrinking it. The box is the same
 * for every thumbnail, so the size only varies by line count and stays within
 * ~20% across the set. With `fillLines`, each line is scaled to fill the box
 * width (varying line widths, the stacked-logo look). Shared by the DOM preview
 * and the canvas export so both match exactly.
 */
export function layoutTextLogo(
  text: string,
  family: string,
  boxW: number,
  boxH: number,
  opts: TextLogoOpts = {},
): TextLogoLayout {
  const weight = opts.weight ?? 900
  const maxLines = Math.max(1, Math.min(4, opts.maxLines ?? 3))
  const LH = opts.lineHeight ?? 1.04
  const scale = opts.scale ?? 1
  const raw = opts.allCaps ? (text || '').toUpperCase() : text || ''
  const baseFs = (boxH / (maxLines * LH)) * scale // fits `maxLines` at the chosen height
  const maxFs = baseFs * 1.2 // ≤20% larger for fewer lines
  const heightCap = (L: number) => boxH / (L * LH) // never overflow the box height
  const uniform = (fs: number, lines: string[]): TextLogoLayout => ({
    fontSize: fs,
    lines,
    lineSizes: lines.map(() => fs),
    lineHeight: LH,
  })
  const words = raw.split(/\s+/).filter(Boolean)
  if (!words.length || typeof document === 'undefined') return uniform(baseFs, [raw])
  measureCtx ??= document.createElement('canvas').getContext('2d')
  const ctx = measureCtx
  if (!ctx) return uniform(baseFs, [raw])
  const measure = (s: string, fs: number) => {
    ctx.font = `${weight} ${fs}px "${family}", sans-serif`
    return ctx.measureText(s).width || 1
  }
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
  // Decide the wrapped lines: fewest lines that fit at the capped size.
  let lines: string[] | null = null
  let fs = baseFs
  for (let L = 1; L <= maxLines; L++) {
    const cand = Math.min(maxFs, heightCap(L))
    const wrapped = wrap(cand)
    if (wrapped.length <= L && Math.max(...wrapped.map((l) => measure(l, cand))) <= boxW) {
      lines = wrapped
      fs = cand
      break
    }
  }
  if (!lines) {
    lines = wrap(baseFs)
    if (lines.length > maxLines) lines = [...lines.slice(0, maxLines - 1), lines.slice(maxLines - 1).join(' ')]
    const widest = Math.max(...lines.map((l) => measure(l, baseFs)))
    fs = widest > boxW ? baseFs * (boxW / widest) : baseFs
  }

  if (!opts.fillLines) return uniform(fs, lines)

  // Vary line widths: scale each line to fill the box width, capped so the stack
  // still fits the box height and a short line can't explode.
  const perLineCap = Math.min(maxFs * 1.9, heightCap(lines.length))
  const lineSizes = lines.map((l) => {
    const at = measure(l, 100)
    return Math.max(6, Math.min(perLineCap, (100 * boxW) / at))
  })
  return { fontSize: fs, lines, lineSizes, lineHeight: LH }
}

/** Inject the Google Fonts stylesheet for a family (once), with its real weights. */
export function ensureFont(family: string) {
  if (!family || loaded.has(family) || typeof document === 'undefined') return
  loaded.add(family)
  const weights = (FONT_WEIGHTS[family] ?? [400, 700]).join(';')
  const href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@${weights}&display=swap`
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
  const w = snapWeight(family, weight)
  try {
    await document.fonts.load(`${w} ${sizePx}px "${family}"`)
    await document.fonts.ready
  } catch {
    /* fall back to system font */
  }
}
