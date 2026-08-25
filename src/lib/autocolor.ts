import { PALETTES, type PaletteMode } from './palettes'

function loadImg(url: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => res(img)
    img.onerror = rej
    img.src = url
  })
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255
  g /= 255
  b /= 255
  const mx = Math.max(r, g, b)
  const mn = Math.min(r, g, b)
  const l = (mx + mn) / 2
  const d = mx - mn
  let h = 0
  let s = 0
  if (d) {
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn)
    switch (mx) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0)
        break
      case g:
        h = (b - r) / d + 2
        break
      default:
        h = (r - g) / d + 4
    }
    h /= 6
  }
  return [h * 360, s, l]
}

function parseHex(hex: string): [number, number, number] {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [128, 128, 128]
}

/**
 * Sample an image's dominant (saturation-weighted) colour and return the key of
 * the closest palette colour by hue — so the frame's tint matches the artwork.
 * Returns null if the image can't be read (load error / CORS taint / greyscale).
 */
export async function autoColorKey(url: string, mode: PaletteMode): Promise<string | null> {
  let img: HTMLImageElement
  try {
    img = await loadImg(url)
  } catch {
    return null
  }
  const s = 28
  const c = document.createElement('canvas')
  c.width = s
  c.height = s
  const ctx = c.getContext('2d')
  if (!ctx) return null
  let data: Uint8ClampedArray
  try {
    ctx.drawImage(img, 0, 0, s, s)
    data = ctx.getImageData(0, 0, s, s).data
  } catch {
    return null // CORS-tainted canvas
  }
  let r = 0
  let g = 0
  let b = 0
  let w = 0
  for (let i = 0; i < data.length; i += 4) {
    const R = data[i]
    const G = data[i + 1]
    const B = data[i + 2]
    const A = data[i + 3] / 255
    if (A < 0.6) continue
    const mx = Math.max(R, G, B)
    const mn = Math.min(R, G, B)
    const sat = mx ? (mx - mn) / mx : 0
    const wt = A * (0.08 + sat * sat) // emphasise vivid pixels over greys
    r += R * wt
    g += G * wt
    b += B * wt
    w += wt
  }
  if (!w) return null
  const [h] = rgbToHsl(r / w, g / w, b / w)
  let best: string | null = null
  let bestD = Infinity
  for (const col of PALETTES[mode]) {
    const [ph] = rgbToHsl(...parseHex(col.stroke))
    let dh = Math.abs(h - ph)
    if (dh > 180) dh = 360 - dh
    if (dh < bestD) {
      bestD = dh
      best = col.key
    }
  }
  return best
}
