/**
 * Finds the centre of the *visible* (non-transparent) pixels of an image, as
 * fractions 0..1 of its width/height. Used to centre a key visual / logo on its
 * artwork rather than on its transparent bounding box — so scaling it up keeps
 * the subject put instead of drifting when the source PNG has uneven padding.
 *
 * The centre is an ALPHA-WEIGHTED CENTROID of solid pixels (alpha ≥ 60), not a
 * bounding box: a faint glow, sparkle or drop shadow reaching one edge barely
 * moves it, where it used to drag a loose alpha>12 bbox — and because the
 * placement correction scales with the rendered size, that bias made the art
 * slide sideways as you resized it.
 *
 * The centroid is used EXACTLY (no tight clamp): the renderer pins this point
 * to the box centre, so the artwork's mass centre stays put at every size and
 * resizing reads as pure scaling around the subject. Clamping the deviation
 * (as a earlier fix did, ±12%) re-introduced drift for genuinely off-centre
 * art — the residual error grows with the rendered size — so only a wide
 * safety limit (±35%) guards against degenerate sources.
 *
 * Results are cached per URL. Analysis needs a CORS-clean image (our CDN sends
 * the right headers); if it can't read the pixels it falls back to the centre.
 */
export type Center = { cx: number; cy: number }
const CENTER: Center = { cx: 0.5, cy: 0.5 }
const cache = new Map<string, Center>()

/** Synchronous cache lookup (null if not computed yet). */
export function opaqueCenterCached(url?: string | null): Center | null {
  if (!url) return null
  return cache.get(url) ?? null
}

/** Safety limit on the deviation from the geometric centre (fraction). Wide on
 *  purpose: a tight clamp mis-pins genuinely off-centre art, and the residual
 *  error scales with the rendered size (= drift while resizing). */
const CLAMP = 0.35

function scanCenter(img: HTMLImageElement): Center {
  const S = 128 // downscale for a fast alpha scan
  const scale = Math.min(1, S / Math.max(img.naturalWidth || 1, img.naturalHeight || 1))
  const w = Math.max(1, Math.round((img.naturalWidth || 1) * scale))
  const h = Math.max(1, Math.round((img.naturalHeight || 1) * scale))
  const cv = document.createElement('canvas')
  cv.width = w
  cv.height = h
  const ctx = cv.getContext('2d', { willReadFrequently: true })
  if (!ctx) return CENTER
  ctx.drawImage(img, 0, 0, w, h)
  const data = ctx.getImageData(0, 0, w, h).data
  // Solid pixels first; if the art is wholly translucent, retry with a low bar.
  for (const cut of [60, 12]) {
    let sum = 0
    let sx = 0
    let sy = 0
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const a = data[(y * w + x) * 4 + 3]
        if (a >= cut) {
          sum += a
          sx += (x + 0.5) * a
          sy += (y + 0.5) * a
        }
      }
    }
    if (sum > 0) {
      const cx = 0.5 + Math.max(-CLAMP, Math.min(CLAMP, sx / sum / w - 0.5))
      const cy = 0.5 + Math.max(-CLAMP, Math.min(CLAMP, sy / sum / h - 0.5))
      return { cx, cy }
    }
  }
  return CENTER
}

/** Compute (and cache) the artwork centre of an already-loaded image (sync). */
export function opaqueCenterFromImage(img: HTMLImageElement): Center {
  const url = img.src
  const hit = cache.get(url)
  if (hit) return hit
  try {
    const res = scanCenter(img)
    cache.set(url, res)
    return res
  } catch {
    return CENTER
  }
}

/** Compute (and cache) the artwork centre of an image URL. */
export async function computeOpaqueCenter(url: string): Promise<Center> {
  const hit = cache.get(url)
  if (hit) return hit
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image()
      i.crossOrigin = 'anonymous'
      i.onload = () => res(i)
      i.onerror = () => rej(new Error('img load'))
      i.src = url
    })
    const res = scanCenter(img)
    cache.set(url, res)
    return res
  } catch {
    cache.set(url, CENTER)
    return CENTER
  }
}
