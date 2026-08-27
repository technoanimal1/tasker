import { useEffect, useRef, useState } from 'react'
import { supabase, figmaProxyUrl } from '../lib/supabase'
import type { Thumbnail } from '../lib/thumb'

const MODELS = [
  { id: 'fal-ai/ltx-video-13b-distilled/image-to-video', label: 'LTX distilled · ⚡ ~20s' },
  { id: 'fal-ai/ltx-2.3/image-to-video/fast', label: 'LTX-2.3 Fast' },
  { id: 'fal-ai/wan-i2v', label: 'Wan 2.1 · balanced' },
  { id: 'fal-ai/kling-video/v1.6/standard/image-to-video', label: 'Kling · best (slow)' },
]

// Kling Pro accepts a tail (end) frame. Setting the tail equal to the head makes
// the clip start and end on the same frame → a perfect, natural forward loop.
const LOOP_MODEL = 'fal-ai/kling-video/v1.6/pro/image-to-video'

type Stage = 'idle' | 'generating' | 'matting' | 'done'

// LTX only renders three aspect buckets; snapping the source to the nearest one
// with transparent letterbox padding stops the model from cropping the sides.
const BUCKETS = [
  { ratio: '9:16', a: 9 / 16 },
  { ratio: '1:1', a: 1 },
  { ratio: '16:9', a: 16 / 9 },
]

function loadImg(url: string) {
  return new Promise<HTMLImageElement>((res, rej) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => res(img)
    img.onerror = () => rej(new Error('key-visual load failed'))
    img.src = url
  })
}

/** Contain the key visual on its nearest aspect bucket (transparent padding) so
 *  nothing is cropped; returns a PNG data URL + the bucket's aspect ratio. */
async function padToBucket(url: string): Promise<{ imageUrl: string; aspect: string }> {
  const img = await loadImg(url)
  const iw = img.naturalWidth
  const ih = img.naturalHeight
  const aSrc = iw / ih
  const bucket = BUCKETS.reduce((b, c) => (Math.abs(c.a - aSrc) < Math.abs(b.a - aSrc) ? c : b))
  const MAX = 1024
  const W = bucket.a >= 1 ? MAX : Math.round(MAX * bucket.a)
  const H = bucket.a >= 1 ? Math.round(MAX / bucket.a) : MAX
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  // Leave a uniform margin so the character never touches the frame edge — the
  // matte keeps this as transparent breathing room, matching the still artwork.
  const MARGIN = 0.1
  const s = Math.min((W * (1 - 2 * MARGIN)) / iw, (H * (1 - 2 * MARGIN)) / ih)
  const dw = iw * s
  const dh = ih * s
  ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh)
  return { imageUrl: canvas.toDataURL('image/png'), aspect: bucket.ratio }
}

export function GenerativeMotion({
  thumb,
  saveAnim,
}: {
  thumb: Thumbnail
  saveAnim: (id: string, url: string | null, prompt: string | null) => Promise<void>
}) {
  const [prompt, setPrompt] = useState('')
  const [model, setModel] = useState(MODELS[0].id)
  const [perfectLoop, setPerfectLoop] = useState(true)
  const [stage, setStage] = useState<Stage>('idle')
  // last matted (transparent) clip produced this session, for download
  const [matted, setMatted] = useState<string | null>(thumb.anim_video_url ?? null)
  const [error, setError] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const startRef = useRef(0)
  const busy = stage === 'generating' || stage === 'matting'

  useEffect(() => {
    setPrompt(thumb.anim_prompt ?? '')
    setMatted(thumb.anim_video_url ?? null)
    setError(null)
    setStage('idle')
  }, [thumb.id, thumb.anim_video_url, thumb.anim_prompt])

  useEffect(() => {
    if (!busy) return
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - startRef.current) / 1000)), 200)
    return () => clearInterval(id)
  }, [busy])

  async function animate() {
    const fk = thumb.figma_file_key
    const kv = thumb.figma_kv_node
    if (!fk || !kv) {
      setError('This game has no key-visual node to animate.')
      return
    }
    setError(null)
    setMatted(null)
    setElapsed(0)
    startRef.current = Date.now()
    const fullPrompt = `${prompt.trim() || 'subtle idle animation'}. Camera locked, preserve the artwork, seamless loop.`
    try {
      // 1 — generate the motion clip. Letterbox the KV onto its nearest aspect
      // bucket first so the model keeps the full width (no side cropping).
      setStage('generating')
      let imageUrl = figmaProxyUrl(fk, kv, 2)
      let aspect = 'auto'
      try {
        const padded = await padToBucket(imageUrl)
        imageUrl = padded.imageUrl
        aspect = padded.aspect
      } catch {
        /* CORS/taint → fall back to the raw url with auto aspect */
      }
      // Perfect loop → Kling Pro with tail = head (same padded frame). Otherwise
      // use the chosen fast model (aspect only applies to the LTX distilled one).
      const useModel = perfectLoop ? LOOP_MODEL : model
      const extra: Record<string, unknown> = perfectLoop
        ? { tail_image_url: imageUrl }
        : useModel === MODELS[0].id
          ? { aspect_ratio: aspect, resolution: '720p' }
          : {}
      const gen = await supabase.functions.invoke('fal-animate', {
        body: { action: 'generate', imageUrl, prompt: fullPrompt, model: useModel, extra },
      })
      if (gen.error || !gen.data?.video) {
        throw new Error(
          gen.data?.error ||
            gen.error?.message ||
            `No video returned.${gen.data?.raw ? ' ' + JSON.stringify(gen.data.raw).slice(0, 200) : ''}`,
        )
      }
      const rawVideo: string = gen.data.video

      // 2 — matte to a transparent clip so it drops onto the background cleanly.
      // Must succeed: the raw clip sits on black, so inserting it un-matted would
      // show a black box instead of compositing over the thumbnail background.
      setStage('matting')
      const mat = await supabase.functions.invoke('fal-animate', {
        body: { action: 'matte', videoUrl: rawVideo },
      })
      if (mat.error || !mat.data?.video) {
        throw new Error(
          mat.data?.error ||
            mat.error?.message ||
            `Background removal failed.${mat.data?.raw ? ' ' + JSON.stringify(mat.data.raw).slice(0, 200) : ''}`,
        )
      }
      const finalVideo: string = mat.data.video

      // 3 — insert into the thumbnail (persist) so it composites everywhere
      await saveAnim(thumb.id, finalVideo, prompt.trim() || null)
      setMatted(finalVideo)
      setStage('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setStage('idle')
    }
  }

  async function remove() {
    await saveAnim(thumb.id, null, null)
    setMatted(null)
    setStage('idle')
  }

  async function download() {
    if (!matted) return
    try {
      const r = await fetch(matted)
      const b = await r.blob()
      const u = URL.createObjectURL(b)
      const a = document.createElement('a')
      a.href = u
      a.download = `${thumb.slug}_motion.webm`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(u)
    } catch {
      window.open(matted, '_blank')
    }
  }

  const inserted = !!thumb.anim_video_url

  return (
    <div className="space-y-2 border-t border-zinc-800 pt-3">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">Generative motion · AI</p>
        {inserted && <span className="rounded-full bg-brand/20 px-2 py-0.5 text-[10px] font-semibold text-brand">● inserted</span>}
      </div>

      {matted && (
        <video
          src={matted}
          autoPlay
          loop
          muted
          playsInline
          className="w-full rounded-lg border border-zinc-800 bg-[conic-gradient(#1a1a1a_90deg,#111_0_180deg,#1a1a1a_0_270deg,#111_0)] [background-size:16px_16px]"
        />
      )}

      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={3}
        placeholder="e.g. the lion roars on loop, keep artwork & proportions"
        className="w-full resize-none rounded-lg border border-zinc-700 bg-zinc-800/60 px-3 py-2 text-xs text-zinc-100 outline-none focus:border-zinc-500"
      />
      <label className="flex cursor-pointer items-center justify-between rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-2">
        <span className="text-xs text-zinc-200">
          Perfect loop <span className="text-zinc-500">· seamless, slower</span>
        </span>
        <input type="checkbox" checked={perfectLoop} onChange={(e) => setPerfectLoop(e.target.checked)} disabled={busy} />
      </label>
      {!perfectLoop && (
        <select
          value={model}
          onChange={(e) => setModel(e.target.value)}
          disabled={busy}
          className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-xs outline-none focus:border-zinc-500 disabled:opacity-60"
        >
          {MODELS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      )}

      <div className="flex items-center gap-2">
        <button
          onClick={animate}
          disabled={busy}
          className="flex-1 rounded-lg bg-brand py-2 text-sm font-semibold text-zinc-900 hover:bg-brand-dark disabled:opacity-60"
        >
          {stage === 'generating'
            ? `Animating… ${elapsed}s`
            : stage === 'matting'
              ? `Cutting out… ${elapsed}s`
              : inserted
                ? 'Regenerate'
                : '✨ Animate & insert'}
        </button>
        {matted && !busy && (
          <button onClick={download} className="rounded-lg border border-zinc-700 px-3 py-2 text-xs font-medium text-zinc-200 hover:bg-zinc-800">
            ⭳ webm
          </button>
        )}
        {inserted && !busy && (
          <button onClick={remove} className="rounded-lg border border-zinc-700 px-3 py-2 text-xs font-medium text-red-300 hover:bg-zinc-800">
            Remove
          </button>
        )}
      </div>

      {busy && (
        <div className="space-y-1">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
            <div className="h-full w-2/5 animate-pulse rounded-full bg-brand" />
          </div>
          <p className="text-[11px] text-zinc-500">
            {stage === 'generating' ? 'Rendering the clip' : 'Removing background (alpha matte)'} · {elapsed}s
          </p>
        </div>
      )}
      {error && <p className="text-[11px] text-red-400">{error}</p>}
      {!busy && !error && !inserted && (
        <p className="text-[11px] text-zinc-500">Animates the key visual, cuts out the background, and drops it into the thumbnail.</p>
      )}
    </div>
  )
}
