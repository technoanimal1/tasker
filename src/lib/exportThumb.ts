import { figmaProxyUrl, assetUrl } from './supabase'
import { resolveColor } from './palettes'
import { layoutTextLogo, loadFontFace, snapWeight } from './fonts'
import { motionAt } from './animate'
import { opaqueCenterFromImage } from './opaqueCenter'
import { CORNER_MODES, CORNER_REF, bandStops, frameSize, hexA, layoutBoxes, resolveGrad, type TemplateParams, type Thumbnail } from './thumb'

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

/** Contain-fit any drawable source (image or video) of known intrinsic size. */
function drawFitSource(
  ctx: CanvasRenderingContext2D,
  src: CanvasImageSource,
  iw: number,
  ih: number,
  bx: number,
  by: number,
  bw: number,
  bh: number,
) {
  if (!iw || !ih) return
  const r = Math.min(bw / iw, bh / ih)
  const dw = iw * r
  const dh = ih * r
  ctx.drawImage(src, bx + (bw - dw) / 2, by + (bh - dh) / 2, dw, dh)
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

function loadVideo(url: string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const v = document.createElement('video')
    v.crossOrigin = 'anonymous'
    v.muted = true
    v.loop = true
    v.playsInline = true
    v.onloadeddata = () => resolve(v)
    v.onerror = () => reject(new Error(`video load failed: ${url}`))
    v.src = url
  })
}

interface Assets {
  bg: HTMLImageElement | null
  kv: HTMLImageElement | null
  logo: HTMLImageElement | null
  /** Matted (transparent) motion clip that replaces the still key visual. */
  kvVideo: HTMLVideoElement | null
}

async function loadAssets(thumb: Thumbnail, params: TemplateParams): Promise<Assets> {
  const fk = thumb.figma_file_key
  // Prefer our own hosted copy (CDN, CORS-enabled) so export/bake never depends
  // on Figma; fall back to the CORS-safe Figma proxy for any uncached layer.
  const proxy = (node: string | null) => (fk && node ? figmaProxyUrl(fk, node, 3) : null)
  const bgU = assetUrl(thumb.bg_path) ?? proxy(thumb.figma_bg_node)
  const kvU = assetUrl(thumb.kv_path) ?? proxy(thumb.figma_kv_node)
  const logoU = params.textLogo
    ? null
    : params.logoVariant === 'white'
      ? assetUrl(thumb.logo_white_path) ?? proxy(thumb.figma_logo_white_node)
      : assetUrl(thumb.logo_color_path) ?? proxy(thumb.figma_logo_color_node)
  const [bg, kv, logo, kvVideo] = await Promise.all([
    bgU ? loadImage(bgU).catch(() => null) : null,
    kvU ? loadImage(kvU).catch(() => null) : null,
    logoU ? loadImage(logoU).catch(() => null) : null,
    thumb.anim_video_url ? loadVideo(thumb.anim_video_url).catch(() => null) : null,
  ])
  return { bg, kv, logo, kvVideo }
}

type Color = ReturnType<typeof resolveColor>

/** Draw a single frame (static, or one animation phase) onto ctx. */
function drawFrame(
  ctx: CanvasRenderingContext2D,
  thumb: Thumbnail,
  params: TemplateParams,
  W: number,
  H: number,
  assets: Assets,
  color: Color,
  phase: number,
) {
  const m = motionAt(params, phase)
  const radius = (CORNER_MODES[params.cornerMode] / CORNER_REF) * W
  const clamp01 = (n: number) => Math.max(0, Math.min(1, n))
  const kk = W / CORNER_REF
  const sw = params.strokeWidth * kk
  const pad = params.strokePad * kk
  // outside = matted: art insets by stroke + pad so the frame sits around it
  const contentInset = sw > 0 && params.strokePos === 'outside' ? sw + pad : 0
  const innerR = Math.max(0, radius - contentInset)

  ctx.clearRect(0, 0, W, H)
  // base fill (shows through the mat margin for outside/padded strokes)
  roundRectPath(ctx, 0, 0, W, H, radius)
  ctx.fillStyle = '#0a0f0c'
  ctx.fill()
  // clip content to the inner (matted) rect
  roundRectPath(ctx, contentInset, contentInset, W - 2 * contentInset, H - 2 * contentInset, innerR)
  ctx.save()
  ctx.clip()
  ctx.fillStyle = '#0a0f0c'
  ctx.fillRect(0, 0, W, H)

  const { bg, kv, logo } = assets
  if (bg) {
    const s = params.bgScale * m.bgScaleMul
    const bgW = W * s
    const bgH = H * s
    drawFit(ctx, bg, (W - bgW) / 2, (H - bgH) / 2, bgW, bgH, 'cover')
  }

  // subtle top darken
  const dg = ctx.createLinearGradient(0, 0, 0, H * 0.3)
  dg.addColorStop(0, 'rgba(3,7,5,0.38)')
  dg.addColorStop(1, 'rgba(3,7,5,0)')
  ctx.fillStyle = dg
  ctx.fillRect(0, 0, W, H * 0.3)

  const layout = params.layouts?.[params.sizeKey]
  const landscape = W / H > 1.2
  const boxes = layout ? layoutBoxes(layout, W, H) : null
  // key-visual box (matches Thumbnail.tsx): saved layout → landscape split → stack
  let kvX: number, kvY: number, kvW: number, kvH: number
  if (boxes) {
    kvX = boxes.kv.x
    kvY = boxes.kv.y
    kvW = boxes.kv.w
    kvH = boxes.kv.h
  } else if (landscape) {
    kvX = 0
    kvY = H * 0.06
    kvW = W * 0.52
    kvH = H * 0.88
  } else {
    kvH = H * (params.kvSizePct / 100)
    kvW = W * (params.kvSizePct / 100)
    kvX = (W - kvW) / 2
    kvY = H - kvH - H * (params.kvBottomPct / 100)
  }
  const kvDX = m.kvDXFrac * W
  const kvDY = m.kvDYFrac * H
  if (assets.kvVideo) {
    drawFitSource(ctx, assets.kvVideo, assets.kvVideo.videoWidth, assets.kvVideo.videoHeight, kvX + kvDX, kvY + kvDY, kvW, kvH)
  } else if (kv) {
    if (params.kvAutoCenter ?? true) {
      // Centre on the visible artwork (matches Thumbnail.tsx ContainImg).
      const c = opaqueCenterFromImage(kv)
      const r = Math.min(kvW / kv.naturalWidth, kvH / kv.naturalHeight)
      const dw = kv.naturalWidth * r
      const dh = kv.naturalHeight * r
      ctx.drawImage(kv, kvX + kvDX + kvW / 2 - c.cx * dw, kvY + kvDY + kvH / 2 - c.cy * dh, dw, dh)
    } else {
      drawFit(ctx, kv, kvX + kvDX, kvY + kvDY, kvW, kvH, 'contain')
    }
  }

  // light band
  const grad = resolveGrad(params)
  const bandH = H * (grad.gradBandPct / 100)
  const band = ctx.createLinearGradient(0, H - bandH, 0, H)
  for (const s of bandStops(color.semantic, color.blur, grad)) band.addColorStop(s.offset, s.color)
  ctx.fillStyle = band
  ctx.fillRect(0, H - bandH, W, bandH)

  const ellipse = (cy: number, rw: number, rh: number, inner: string, outer: string, blend?: GlobalCompositeOperation, alpha = 1) => {
    ctx.save()
    if (blend) ctx.globalCompositeOperation = blend
    ctx.globalAlpha = alpha
    ctx.translate(W / 2, cy)
    ctx.scale(rw, rh)
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1)
    g.addColorStop(0, inner)
    g.addColorStop(0.72, outer)
    ctx.fillStyle = g
    ctx.fillRect(-1, -1, 2, 2)
    ctx.restore()
  }
  ellipse(H * 0.88, W * 0.45, H * 0.17, hexA(color.blur, 0.85), hexA(color.blur, 0))
  ellipse(H * 0.985, W * 0.4055 * m.bloomScale, H * 0.1375 * m.bloomScale, '#ffffff', 'rgba(255,255,255,0)', 'overlay', m.bloomOpacity)

  // logo — image or text, with optional motion scale
  const boxX = boxes ? boxes.logo.x : landscape ? W * 0.5 : params.logo.xPct * W
  const boxY = boxes ? boxes.logo.y : landscape ? H * 0.28 : params.logo.yPct * H
  const boxW = boxes ? boxes.logo.w : landscape ? W * 0.46 : params.logo.wPct * W
  const boxH = boxes ? boxes.logo.h : landscape ? H * 0.44 : params.logo.hPct * H
  ctx.save()
  if (m.logoScale !== 1) {
    const cx = boxX + boxW / 2
    const cy = boxY + boxH / 2
    ctx.translate(cx, cy)
    ctx.scale(m.logoScale, m.logoScale)
    ctx.translate(-cx, -cy)
  }
  if (params.textLogo && thumb.name) {
    const weight = snapWeight(params.fontFamily, params.textWeight)
    const { lines, lineSizes, lineHeight } = layoutTextLogo(thumb.name, params.fontFamily, boxW, boxH, {
      weight,
      maxLines: params.textMaxLines,
      lineHeight: params.textLineHeight,
      scale: params.textScale,
      fillLines: params.textFillLines,
      allCaps: params.textAllCaps,
    })
    const fill =
      params.textColorMode === 'white' ? '#ffffff' : params.textColorMode === 'custom' ? params.textColor : color.stroke
    ctx.textAlign = params.textAlign
    ctx.textBaseline = 'middle'
    const tx = params.textAlign === 'left' ? boxX : params.textAlign === 'right' ? boxX + boxW : boxX + boxW / 2
    const totalH = lineSizes.reduce((sum, s) => sum + s * lineHeight, 0)
    let y = boxY + boxH / 2 - totalH / 2
    if (params.textShadow) {
      ctx.shadowColor = 'rgba(0,0,0,0.45)'
      ctx.shadowBlur = H * 0.02
      ctx.shadowOffsetY = H * 0.006
    }
    ctx.fillStyle = fill
    const lc = ctx as CanvasRenderingContext2D & { letterSpacing: string }
    lines.forEach((l, i) => {
      const s = lineSizes[i]
      ctx.font = `${weight} ${s}px "${params.fontFamily}", "Helvetica Neue", Arial, sans-serif`
      try {
        lc.letterSpacing = `${s * (params.textLetterPct / 100)}px`
      } catch {
        /* letterSpacing unsupported */
      }
      ctx.fillText(l, tx, y + (s * lineHeight) / 2)
      y += s * lineHeight
    })
    try {
      lc.letterSpacing = '0px'
    } catch {
      /* noop */
    }
  } else if (logo) {
    drawFit(ctx, logo, boxX, boxY, boxW, boxH, 'contain')
  }
  ctx.restore()

  // shine sweep
  if (m.shine != null) {
    ctx.save()
    ctx.globalCompositeOperation = 'overlay'
    const center = m.shine * 1.4 - 0.2
    const g = ctx.createLinearGradient(0, 0, W, 0)
    g.addColorStop(clamp01(center - 0.12), 'rgba(255,255,255,0)')
    g.addColorStop(clamp01(center), 'rgba(255,255,255,0.55)')
    g.addColorStop(clamp01(center + 0.12), 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, W, H)
    ctx.restore()
  }

  const ptext = params.providerName.trim() || thumb.provider
  if (params.showProvider && ptext) {
    const fs = W * 0.025 * params.providerScale
    ctx.font = `700 ${fs}px "Helvetica Neue", Arial, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const tw = ctx.measureText(ptext).width
    const topPad = params.providerPadY * kk
    const pillW = tw + params.providerPadX * kk * 2
    const pillH = fs * 1.15 + topPad // top padding only — no bottom padding
    const pos = params.providerPos
    const mx = params.providerMarginX * kk
    const my = params.providerMarginY * kk
    const pillX = pos === 'top' || pos === 'bottom'
      ? W / 2 - pillW / 2
      : pos.endsWith('left')
        ? mx
        : W - mx - pillW
    const pillY = pos.startsWith('top') ? my : H - my - pillH
    const cap = pillH / 2
    const rr = params.providerRadius
    ctx.fillStyle = color.blur
    ctx.beginPath()
    ;(ctx as CanvasRenderingContext2D & { roundRect: (x: number, y: number, w: number, h: number, r: number[]) => void }).roundRect(
      pillX, pillY, pillW, pillH,
      [Math.min(rr.tl * kk, cap), Math.min(rr.tr * kk, cap), Math.min(rr.br * kk, cap), Math.min(rr.bl * kk, cap)],
    )
    ctx.fill()
    ctx.fillStyle = '#ffffff'
    ctx.fillText(ptext, pillX + pillW / 2, pillY + topPad + (fs * 1.15) / 2 + fs * 0.02)
  }

  ctx.restore()

  // frame stroke — inset from the edge by pad (outside also insets the content)
  if (sw > 0) {
    const off = pad + sw / 2
    roundRectPath(ctx, off, off, W - 2 * off, H - 2 * off, Math.max(0, radius - off))
    ctx.lineWidth = sw
    ctx.strokeStyle = color.stroke
    ctx.stroke()
  }
}

// ── still image export ───────────────────────────────────────────────────────
export type StillFormat = 'png' | 'webp' | 'avif'
const MIME: Record<StillFormat, string> = { png: 'image/png', webp: 'image/webp', avif: 'image/avif' }

export async function renderThumbBlob(thumb: Thumbnail, params: TemplateParams, mult = 1, format: StillFormat = 'png'): Promise<Blob> {
  const size = frameSize(params.sizeKey)
  const W = size.w * mult
  const H = size.h * mult
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  const color = resolveColor(params.palette, params.colorKey)
  const assets = await loadAssets(thumb, params)
  if (params.textLogo) await loadFontFace(params.fontFamily)
  drawFrame(ctx, thumb, params, W, H, assets, color, 0)

  const type = MIME[format]
  let blob: Blob | null = await new Promise((res) => canvas.toBlob(res, type, 0.95))
  // Some browsers can't encode AVIF/WebP → fall back to PNG.
  if (!blob || (blob.type !== type && format !== 'png')) {
    blob = await new Promise((res) => canvas.toBlob(res, 'image/png'))
  }
  if (!blob) throw new Error('export failed')
  return blob
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function baseName(thumb: Thumbnail, params: TemplateParams) {
  return `${thumb.slug}_${params.sizeKey.replace(':', 'x')}`
}

export async function exportThumbPng(thumb: Thumbnail, params: TemplateParams, mult = 1, format: StillFormat = 'png'): Promise<number> {
  const blob = await renderThumbBlob(thumb, params, mult, format)
  const ext = blob.type === 'image/png' ? 'png' : format
  download(blob, `${baseName(thumb, params)}.${ext}`)
  return blob.size
}

// ── animated export (WebM) ───────────────────────────────────────────────────
function pickAnimMime(): string | null {
  if (typeof MediaRecorder === 'undefined') return null
  const candidates = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']
  return candidates.find((c) => MediaRecorder.isTypeSupported(c)) ?? null
}

export function animSupported(): boolean {
  return pickAnimMime() !== null
}

/** Record one seamless loop of the animation to a WebM blob. */
export async function renderThumbAnimBlob(thumb: Thumbnail, params: TemplateParams, mult = 1, fps = 30): Promise<Blob> {
  const mime = pickAnimMime()
  if (!mime) throw new Error('Animated export is not supported in this browser.')
  const size = frameSize(params.sizeKey)
  const W = size.w * mult
  const H = size.h * mult
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  const color = resolveColor(params.palette, params.colorKey)
  const assets = await loadAssets(thumb, params)
  if (params.textLogo) await loadFontFace(params.fontFamily)

  const stream = canvas.captureStream(fps)
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8_000_000 })
  const chunks: Blob[] = []
  rec.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data)
  }
  const durationMs = Math.max(0.5, params.animSpeed) * 1000

  return new Promise<Blob>((resolve, reject) => {
    rec.onstop = () => resolve(new Blob(chunks, { type: mime }))
    // draw the first frame before starting so the stream has content
    drawFrame(ctx, thumb, params, W, H, assets, color, 0)
    rec.start()
    const t0 = performance.now()
    const loop = () => {
      try {
        const el = performance.now() - t0
        const phase = (el % durationMs) / durationMs
        drawFrame(ctx, thumb, params, W, H, assets, color, phase)
        if (el >= durationMs) {
          drawFrame(ctx, thumb, params, W, H, assets, color, 1)
          rec.stop()
        } else {
          requestAnimationFrame(loop)
        }
      } catch (e) {
        try { rec.stop() } catch { /* already stopped */ }
        reject(e instanceof Error ? e : new Error(String(e)))
      }
    }
    requestAnimationFrame(loop)
  })
}

/** Record the inserted matted motion clip composited into the full thumbnail. */
export async function renderThumbVideoBlob(thumb: Thumbnail, params: TemplateParams, mult = 1, fps = 30): Promise<Blob> {
  const mime = pickAnimMime()
  if (!mime) throw new Error('Animated export is not supported in this browser.')
  const size = frameSize(params.sizeKey)
  const W = size.w * mult
  const H = size.h * mult
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  const color = resolveColor(params.palette, params.colorKey)
  const assets = await loadAssets(thumb, params)
  if (params.textLogo) await loadFontFace(params.fontFamily)
  const vid = assets.kvVideo
  // The clip is inserted but couldn't be decoded (usually the host didn't send
  // CORS headers). Fail loudly rather than silently exporting a frozen frame.
  if (!vid) {
    if (thumb.anim_video_url) {
      throw new Error('Could not load the motion clip for export — its host must allow cross-origin (CORS) requests.')
    }
    return renderThumbAnimBlob(thumb, params, mult, fps)
  }

  const stream = canvas.captureStream(fps)
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8_000_000 })
  const chunks: Blob[] = []
  rec.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data)
  }
  const dur = Number.isFinite(vid.duration) && vid.duration > 0 ? vid.duration : 4
  const durationMs = dur * 1000

  vid.loop = false
  vid.currentTime = 0
  await vid.play().catch(() => {})

  return new Promise<Blob>((resolve, reject) => {
    rec.onstop = () => resolve(new Blob(chunks, { type: mime }))
    drawFrame(ctx, thumb, params, W, H, assets, color, 0)
    rec.start()
    const t0 = performance.now()
    const loop = () => {
      try {
        const el = performance.now() - t0
        const phase = Math.min(1, el / durationMs)
        drawFrame(ctx, thumb, params, W, H, assets, color, phase)
        if (el >= durationMs || vid.ended) {
          vid.pause()
          rec.stop()
        } else {
          requestAnimationFrame(loop)
        }
      } catch (e) {
        vid.pause()
        try { rec.stop() } catch { /* already stopped */ }
        reject(e instanceof Error ? e : new Error(String(e)))
      }
    }
    requestAnimationFrame(loop)
  })
}

export async function exportThumbAnim(thumb: Thumbnail, params: TemplateParams, mult = 1, fps = 30): Promise<number> {
  const blob = thumb.anim_video_url
    ? await renderThumbVideoBlob(thumb, params, mult, fps)
    : await renderThumbAnimBlob(thumb, params, mult, fps)
  download(blob, `${baseName(thumb, params)}.webm`)
  return blob.size
}
