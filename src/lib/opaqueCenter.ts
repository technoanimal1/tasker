/**
 * Finds the centre of the *visible* (non-transparent) pixels of an image, as
 * fractions 0..1 of its width/height. Used to centre a key visual / logo on its
 * artwork rather than on its transparent bounding box — so scaling it up keeps
 * the subject put instead of drifting when the source PNG has uneven padding.
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

/** Compute (and cache) the opaque centre of an already-loaded image (sync). */
export function opaqueCenterFromImage(img: HTMLImageElement): Center {
  const url = img.src
  const hit = cache.get(url)
  if (hit) return hit
  try {
    const S = 128
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
    let minX = w, minY = h, maxX = -1, maxY = -1
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (data[(y * w + x) * 4 + 3] > 12) {
          if (x < minX) minX = x
          if (x > maxX) maxX = x
          if (y < minY) minY = y
          if (y > maxY) maxY = y
        }
      }
    }
    const res: Center = maxX >= minX && maxY >= minY ? { cx: (minX + maxX + 1) / 2 / w, cy: (minY + maxY + 1) / 2 / h } : CENTER
    cache.set(url, res)
    return res
  } catch {
    return CENTER
  }
}

/** Compute (and cache) the opaque-pixel centre of an image URL. */
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
    const S = 128 // downscale for a fast alpha scan
    const scale = Math.min(1, S / Math.max(img.naturalWidth || 1, img.naturalHeight || 1))
    const w = Math.max(1, Math.round((img.naturalWidth || 1) * scale))
    const h = Math.max(1, Math.round((img.naturalHeight || 1) * scale))
    const cv = document.createElement('canvas')
    cv.width = w
    cv.height = h
    const ctx = cv.getContext('2d', { willReadFrequently: true })
    if (!ctx) throw new Error('no ctx')
    ctx.drawImage(img, 0, 0, w, h)
    const data = ctx.getImageData(0, 0, w, h).data
    let minX = w, minY = h, maxX = -1, maxY = -1
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (data[(y * w + x) * 4 + 3] > 12) {
          if (x < minX) minX = x
          if (x > maxX) maxX = x
          if (y < minY) minY = y
          if (y > maxY) maxY = y
        }
      }
    }
    const res: Center =
      maxX >= minX && maxY >= minY
        ? { cx: (minX + maxX + 1) / 2 / w, cy: (minY + maxY + 1) / 2 / h }
        : CENTER
    cache.set(url, res)
    return res
  } catch {
    cache.set(url, CENTER)
    return CENTER
  }
}
