import { storageUrl } from './supabase'
import { CARD_W, CARD_H, hexA, type TemplateParams, type Thumbnail } from './thumb'

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`load failed: ${url}`))
    img.src = url
  })
}

function drawContain(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  bx: number,
  by: number,
  bw: number,
  bh: number,
) {
  const s = Math.min(bw / img.naturalWidth, bh / img.naturalHeight)
  const dw = img.naturalWidth * s
  const dh = img.naturalHeight * s
  ctx.drawImage(img, bx + (bw - dw) / 2, by + (bh - dh) / 2, dw, dh)
}

function drawCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  bx: number,
  by: number,
  bw: number,
  bh: number,
) {
  const s = Math.max(bw / img.naturalWidth, bh / img.naturalHeight)
  const dw = img.naturalWidth * s
  const dh = img.naturalHeight * s
  ctx.drawImage(img, bx + (bw - dw) / 2, by + (bh - dh) / 2, dw, dh)
}

function roundRectPath(
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

/** Render a thumbnail to a full-resolution PNG blob. */
export async function renderThumbBlob(
  thumb: Thumbnail,
  params: TemplateParams,
  scale = 4,
): Promise<Blob> {
  const W = CARD_W * scale
  const H = CARD_H * scale
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  const accent = thumb.accent_color || '#0c8022'
  const S = scale

  roundRectPath(ctx, 0, 0, W, H, params.cornerRadius * S)
  ctx.save()
  ctx.clip()

  // dark base
  ctx.fillStyle = '#0a0f0c'
  ctx.fillRect(0, 0, W, H)

  const [bg, kv, logo] = await Promise.all([
    thumb.bg_path ? loadImage(storageUrl(thumb.bg_path)!).catch(() => null) : null,
    thumb.kv_path ? loadImage(storageUrl(thumb.kv_path)!).catch(() => null) : null,
    (params.logoVariant === 'white' ? thumb.logo_white_path : thumb.logo_color_path)
      ? loadImage(
          storageUrl(params.logoVariant === 'white' ? thumb.logo_white_path : thumb.logo_color_path)!,
        ).catch(() => null)
      : null,
  ])

  if (bg) {
    const bgW = CARD_W * params.bgScale * S
    const bgH = CARD_H * params.bgScale * S
    const left = ((CARD_W - CARD_W * params.bgScale) / 2 + params.bgOffsetX) * S
    const top = ((CARD_H - CARD_H * params.bgScale) / 2 + params.bgOffsetY) * S
    drawCover(ctx, bg, left, top, bgW, bgH)
  }

  // accent glow (elliptical radial from bottom)
  ctx.save()
  ctx.translate(W / 2, H * 1.16)
  ctx.scale((W * 1.35) / 2, H * 0.68)
  const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, 1)
  grad.addColorStop(0, accent)
  grad.addColorStop(0.34, hexA(accent, 0.55))
  grad.addColorStop(0.62, hexA(accent, 0))
  ctx.fillStyle = grad
  ctx.fillRect(-1, -1, 2, 2)
  ctx.restore()

  // top darken
  const dg = ctx.createLinearGradient(0, 0, 0, H)
  dg.addColorStop(0, 'rgba(3,7,5,0.45)')
  dg.addColorStop(0.28, 'rgba(3,7,5,0)')
  dg.addColorStop(0.58, 'rgba(3,7,5,0)')
  dg.addColorStop(1, 'rgba(3,7,5,0.18)')
  ctx.fillStyle = dg
  ctx.fillRect(0, 0, W, H)

  if (kv) {
    const kvW = CARD_W * params.kvScale * S
    const kvH = CARD_H * params.kvScale * S
    const left = ((CARD_W - CARD_W * params.kvScale) / 2) * S
    const top = ((CARD_H - CARD_H * params.kvScale) / 2 + params.kvOffsetY) * S
    drawContain(ctx, kv, left, top, kvW, kvH)
  }

  if (logo) {
    drawContain(ctx, logo, params.logo.x * S, params.logo.y * S, params.logo.w * S, params.logo.h * S)
  }

  // provider pill
  if (params.showProvider && thumb.provider) {
    ctx.font = `700 ${12 * S}px "Helvetica Neue", Arial, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const tw = ctx.measureText(thumb.provider).width
    const padX = 16 * S
    const pillW = tw + padX * 2
    const pillH = 24 * S
    const pillX = W / 2 - pillW / 2
    const pillY = H - 12 * S - pillH
    ctx.fillStyle = accent
    roundRectPath(ctx, pillX, pillY, pillW, pillH, pillH / 2)
    ctx.fill()
    ctx.fillStyle = '#ffffff'
    ctx.fillText(thumb.provider, W / 2, pillY + pillH / 2 + S)
  }

  ctx.restore()

  // accent border
  roundRectPath(ctx, S, S, W - 2 * S, H - 2 * S, params.cornerRadius * S)
  ctx.lineWidth = 2 * S
  ctx.strokeStyle = accent
  ctx.stroke()

  const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, 'image/png'))
  if (!blob) throw new Error('export failed')
  return blob
}

export async function exportThumbPng(thumb: Thumbnail, params: TemplateParams, scale = 4) {
  const blob = await renderThumbBlob(thumb, params, scale)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${thumb.slug}.png`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
