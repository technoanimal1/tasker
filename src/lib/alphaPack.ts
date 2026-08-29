import { supabase } from './supabase'

/**
 * Transparent video that works on every browser — including iOS Safari, which
 * cannot decode WebM's alpha channel and paints it black.
 *
 * We take the transparent VP9 WebM produced by the matte step and re-pack it as
 * an ordinary H.264 MP4 where the frame is stacked vertically: the top half is
 * the colour (already premultiplied — the subject sits over black), the bottom
 * half is the alpha channel as a white-on-black luminance matte. H.264 plays
 * everywhere; <AlphaVideo> recombines the two halves into real transparency with
 * a tiny WebGL shader at render time.
 *
 * Packing runs in the browser (Chrome/Firefox, where WebM alpha decodes) using
 * canvas + MediaRecorder — no server transcode, no extra dependency, no credits.
 */

const MP4_TYPES = ['video/mp4;codecs=avc1.640028', 'video/mp4;codecs=avc1.42E01E', 'video/mp4']

/** The MediaRecorder MIME this browser can emit as MP4/H.264, or null. */
export function mp4RecordingType(): string | null {
  if (typeof MediaRecorder === 'undefined') return null
  for (const t of MP4_TYPES) {
    try {
      if (MediaRecorder.isTypeSupported(t)) return t
    } catch {
      /* ignore */
    }
  }
  return null
}

/** Safari/iOS can't decode the source WebM's alpha (they'd pack a black clip),
 *  so packing must only run where WebM alpha decodes — Chrome/Firefox/Chromium. */
function isSafariOrIOS(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  const iOS = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && 'ontouchend' in document)
  const safari = /^((?!chrome|chromium|crios|android|fxios|edg).)*safari/i.test(ua)
  return iOS || safari
}

/** True if this browser can produce the alpha-packed MP4: needs MP4 recording AND
 *  the ability to decode the transparent WebM (so never Safari/iOS). */
export function canPackAlpha(): boolean {
  return mp4RecordingType() != null && !isSafariOrIOS()
}

/** Pack a transparent WebM URL into an alpha-packed H.264 MP4 Blob. */
export async function packAlphaWebmToMp4(webmUrl: string, fps = 30): Promise<Blob> {
  const mime = mp4RecordingType()
  if (!mime) throw new Error('This browser can’t record MP4 — generate/upgrade from Chrome.')

  // Fetch to a same-origin blob so the canvas isn’t tainted (captureStream needs
  // a clean canvas). Falls back to a direct crossOrigin load if fetch is blocked.
  let blobUrl: string | null = null
  try {
    const r = await fetch(webmUrl, { mode: 'cors' })
    if (r.ok) blobUrl = URL.createObjectURL(await r.blob())
  } catch {
    /* fall through to direct load */
  }

  const video = document.createElement('video')
  video.crossOrigin = 'anonymous'
  video.muted = true
  video.playsInline = true
  video.src = blobUrl ?? webmUrl
  try {
    await new Promise<void>((res, rej) => {
      video.onloadedmetadata = () => res()
      video.onerror = () => rej(new Error('could not decode the clip'))
    })
    const W = video.videoWidth
    const H = video.videoHeight
    if (!W || !H) throw new Error('clip has no dimensions')

    const canvas = document.createElement('canvas')
    canvas.width = W
    canvas.height = H * 2
    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) throw new Error('no 2d context')
    // Scratch canvas to convert the video's alpha into a white matte.
    const mat = document.createElement('canvas')
    mat.width = W
    mat.height = H
    const mctx = mat.getContext('2d')
    if (!mctx) throw new Error('no 2d context')

    const stream = canvas.captureStream(fps)
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8_000_000 })
    const chunks: BlobPart[] = []
    rec.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data)
    }
    const recorded = new Promise<Blob>((res) => {
      rec.onstop = () => res(new Blob(chunks, { type: 'video/mp4' }))
    })

    let raf = 0
    const draw = () => {
      // top half — colour over black (premultiplied)
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, W, H)
      ctx.drawImage(video, 0, 0, W, H)
      // bottom half — alpha as a white-on-black matte (fill white, keep where the
      // video has alpha, then lay it over black)
      mctx.globalCompositeOperation = 'source-over'
      mctx.clearRect(0, 0, W, H)
      mctx.fillStyle = '#fff'
      mctx.fillRect(0, 0, W, H)
      mctx.globalCompositeOperation = 'destination-in'
      mctx.drawImage(video, 0, 0, W, H)
      ctx.fillStyle = '#000'
      ctx.fillRect(0, H, W, H)
      ctx.drawImage(mat, 0, H, W, H)
      raf = requestAnimationFrame(draw)
    }

    // Record exactly one loop: play once, stop on ended.
    video.loop = false
    video.currentTime = 0
    await video.play()
    rec.start()
    draw()
    await new Promise<void>((res) => {
      video.onended = () => res()
      // Safety cap so a missed 'ended' can’t hang the encode.
      setTimeout(res, Math.min(30000, (video.duration || 6) * 1000 + 1500))
    })
    cancelAnimationFrame(raf)
    if (rec.state !== 'inactive') rec.stop()
    return await recorded
  } finally {
    if (blobUrl) URL.revokeObjectURL(blobUrl)
  }
}

/** Pack + upload to the public `previews` bucket; returns the public MP4 URL. */
export async function packAndUploadAlpha(id: string, webmUrl: string): Promise<string> {
  const blob = await packAlphaWebmToMp4(webmUrl)
  const path = `anim/${id}.mp4`
  const { error } = await supabase.storage.from('previews').upload(path, blob, {
    upsert: true,
    contentType: 'video/mp4',
    cacheControl: '31536000',
  })
  if (error) throw error
  const { data } = supabase.storage.from('previews').getPublicUrl(path)
  // Bust CDN cache on re-pack (stable path).
  return `${data.publicUrl}?v=${Date.now().toString(36)}`
}
