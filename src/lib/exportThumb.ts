import { figmaProxyUrl } from './supabase'
import { resolveColor } from './palettes'
import { CORNER_MODES, CORNER_REF, frameSize, hexA, type TemplateParams, type Thumbnail } from './thumb'

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`load failed: ${url}`))
    img.src = url
  })
}

function drawFit(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  bx: number,
  by: number,
  bw: number,
  bh: number,
  mode: 'cover' | 'contain',
) {
  const r = mode === 'cover' ? Math.max(bw / img.naturalWidth, bh / img.naturalHeight) : Math.min(bw / img.naturalWidth, bh / img.naturalHeight)
  const dw = img.naturalWidth * r
  const dh = img.naturalHeight * r
  ctx.drawImage(img, bx + (bw - dw) / 2, by + (bh - dh) / 2, dw, dh)
}

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2))
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + w, y, rr)
  ctx.closePath()
}

export async function renderThumbBlob(thumb: Thumbnail, params: TemplateParams, mult = 1): Promise<Blob> {
  const size = frameSize(params.sizeKey)
  const W = size.w * mult
  const H = size.h * mult
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  const color = resolveColor(params.palette, params.colorKey)
  const radius = (CORNER_MODES[params.cornerMode] / CORNER_REF) * W

  roundRectPath(ctx, 0, 0, W, H, radius)
  ctx.save()
  ctx.clip()
  ctx.fillStyle = '#0a0f0c'
  ctx.fillRect(0, 0, W, H)

  const fk = thumb.figma_file_key
  const proxy = (node: string | null) => (fk && node ? figmaProxyUrl(fk, node, 3) : null)
  const bgU = proxy(thumb.figma_bg_node)
  const kvU = proxy(thumb.figma_kv_node)
  const logoU = proxy(params.logoVariant === 'white' ? thumb.figma_logo_white_node : thumb.figma_logo_color_node)
  const [bg, kv, logo] = await Promise.all([
    bgU ? loadImage(bgU).catch(() => null) : null,
    kvU ? loadImage(kvU).catch(() => null) : null,
    logoU ? loadImage(logoU).catch(() => null) : null,
  ])

  if (bg) {
    const bgW = W * params.bgScale
    const bgH = H * params.bgScale
    drawFit(ctx, bg, (W - bgW) / 2 + params.bgOffsetXPct * W, (H - bgH) / 2 + params.bgOffsetYPct * H, bgW, bgH, 'cover')
  }

  // colour glow (elliptical radial from bottom)
  ctx.save()
  ctx.translate(W / 2, H * 1.18)
  ctx.scale((W * 1.4) / 2, H * 0.62)
  const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, 1)
  grad.addColorStop(0, color.blur)
  grad.addColorStop(0.3, color.semantic)
  grad.addColorStop(0.6, hexA(color.blur, 0))
  ctx.fillStyle = grad
  ctx.fillRect(-1, -1, 2, 2)
  ctx.restore()

  const dg = ctx.createLinearGradient(0, 0, 0, H)
  dg.addColorStop(0, 'rgba(3,7,5,0.42)')
  dg.addColorStop(0.26, 'rgba(3,7,5,0)')
  dg.addColorStop(0.6, 'rgba(3,7,5,0)')
  dg.addColorStop(1, 'rgba(3,7,5,0.15)')
  ctx.fillStyle = dg
  ctx.fillRect(0, 0, W, H)

  if (kv) {
    const kvBoxH = H * (params.kvSizePct / 100)
    const kvTop = H - kvBoxH - H * (params.kvBottomPct / 100)
    drawFit(ctx, kv, 0, kvTop, W, kvBoxH, 'contain')
  }

  if (logo) {
    drawFit(ctx, logo, params.logo.xPct * W, params.logo.yPct * H, params.logo.wPct * W, params.logo.hPct * H, 'contain')
  }

  if (params.showProvider && thumb.provider) {
    ctx.font = `700 ${W * 0.05}px "Helvetica Neue", Arial, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const tw = ctx.measureText(thumb.provider).width
    const padX = W * 0.06
    const pillW = tw + padX * 2
    const pillH = W * 0.082
    const pillX = W / 2 - pillW / 2
    const pillY = H - H * 0.035 - pillH
    ctx.fillStyle = color.blur
    roundRectPath(ctx, pillX, pillY, pillW, pillH, pillH / 2)
    ctx.fill()
    ctx.fillStyle = '#ffffff'
    ctx.fillText(thumb.provider, W / 2, pillY + pillH / 2 + W * 0.004)
  }

  ctx.restore()

  const sw = Math.max(2, W * 0.006)
  roundRectPath(ctx, sw / 2, sw / 2, W - sw, H - sw, radius)
  ctx.lineWidth = sw
  ctx.strokeStyle = color.stroke
  ctx.stroke()

  const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, 'image/png'))
  if (!blob) throw new Error('export failed')
  return blob
}

export async function exportThumbPng(thumb: Thumbnail, params: TemplateParams, mult = 1) {
  const blob = await renderThumbBlob(thumb, params, mult)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${thumb.slug}_${params.sizeKey.replace(':', 'x')}.png`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
