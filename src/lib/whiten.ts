// Turn a colour logo into a clean white logotype: keep the exact shape/alpha,
// fill it solid white. Deterministic, instant, free — no AI needed. Needs a
// CORS-clean source (use the Figma proxy URL).
const cache = new Map<string, string>()

function load(url: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const i = new Image()
    i.crossOrigin = 'anonymous'
    i.onload = () => res(i)
    i.onerror = rej
    i.src = url
  })
}

export async function whitenLogo(url: string): Promise<string | null> {
  if (!url) return null
  if (cache.has(url)) return cache.get(url)!
  let img: HTMLImageElement
  try {
    img = await load(url)
  } catch {
    return null
  }
  const w = img.naturalWidth || 512
  const h = img.naturalHeight || 512
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')
  if (!ctx) return null
  try {
    ctx.drawImage(img, 0, 0)
    // recolour every opaque pixel to white, preserving the alpha silhouette
    ctx.globalCompositeOperation = 'source-in'
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, w, h)
    const data = c.toDataURL('image/png')
    cache.set(url, data)
    return data
  } catch {
    return null // CORS-tainted canvas
  }
}
