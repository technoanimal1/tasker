import type { AssetKind, Frame, Layer } from './types'

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`Could not load image: ${url}`))
    img.src = url
  })
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2))
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + w, y, rr)
  ctx.closePath()
}

function drawText(ctx: CanvasRenderingContext2D, l: Layer) {
  const size = l.fontSize ?? 32
  const weight = l.fontWeight ?? 400
  ctx.font = `${weight} ${size}px ${l.fontFamily ?? 'Inter, system-ui, sans-serif'}`
  ctx.fillStyle = l.color ?? '#ffffff'
  ctx.textBaseline = 'middle'
  const align = l.align ?? 'left'
  ctx.textAlign = align

  const lines = (l.text ?? '').split('\n')
  const lineHeight = size * 1.1
  const totalH = lineHeight * lines.length
  // Local coords: box centered at origin.
  const x = align === 'left' ? -l.w / 2 : align === 'right' ? l.w / 2 : 0
  let y = -totalH / 2 + lineHeight / 2
  for (const line of lines) {
    ctx.fillText(line, x, y)
    y += lineHeight
  }
}

/** Renders the frame at full resolution and triggers a PNG download. */
export async function exportFramePng(frame: Frame, resolve: (k: AssetKind) => string | null) {
  const canvas = document.createElement('canvas')
  canvas.width = frame.width
  canvas.height = frame.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas not supported')

  ctx.fillStyle = frame.background_color
  ctx.fillRect(0, 0, frame.width, frame.height)

  const layers = [...frame.layout].sort((a, b) => a.z - b.z)

  // Resolve the image URL for a layer: shared asset by kind, or an image layer's own src.
  const urlOf = (l: Layer): string | null =>
    l.type === 'asset' && l.assetKind
      ? resolve(l.assetKind)
      : l.type === 'image'
        ? l.src ?? null
        : null

  // Preload all images (asset + image layers).
  const imgs = new Map<string, HTMLImageElement>()
  await Promise.all(
    layers.map(async (l) => {
      const url = urlOf(l)
      if (url && !imgs.has(url)) {
        try {
          imgs.set(url, await loadImage(url))
        } catch {
          /* skip broken asset */
        }
      }
    }),
  )

  for (const l of layers) {
    ctx.save()
    ctx.globalAlpha = l.opacity
    const cx = l.x + l.w / 2
    const cy = l.y + l.h / 2
    ctx.translate(cx, cy)
    ctx.rotate((l.rotation * Math.PI) / 180)

    if ((l.type === 'asset' && l.assetKind) || l.type === 'image') {
      const url = urlOf(l)
      const img = url ? imgs.get(url) : undefined
      if (img) {
        const s = Math.min(l.w / img.naturalWidth, l.h / img.naturalHeight)
        const dw = img.naturalWidth * s
        const dh = img.naturalHeight * s
        ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh)
      }
    } else if (l.type === 'text') {
      drawText(ctx, l)
    } else if (l.type === 'rect') {
      ctx.fillStyle = l.fill ?? '#6d5efc'
      roundRect(ctx, -l.w / 2, -l.h / 2, l.w, l.h, l.radius ?? 0)
      ctx.fill()
    }
    ctx.restore()
  }

  const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, 'image/png'))
  if (!blob) throw new Error('Export failed (canvas may be tainted by a cross-origin asset)')

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${frame.name.replace(/[^a-z0-9-_]+/gi, '_')}.png`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
