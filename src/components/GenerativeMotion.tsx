import { useEffect, useRef, useState } from 'react'
import { supabase, figmaProxyUrl } from '../lib/supabase'
import type { Thumbnail } from '../lib/thumb'
import { canPackAlpha, packAndUploadAlpha } from '../lib/alphaPack'
import { Download } from 'lucide-react'

// Motion styles offered to clients. EVERY option produces a perfect loop: each
// model accepts an end/tail frame, and we set it equal to the head frame so the
// clip returns to frame 1. `tail` is that model's end-frame parameter name.
const LOOP_MODELS = [
  { id: 'fal-ai/minimax/hailuo-02/standard/image-to-video', label: 'Smooth · fast', tail: 'end_image_url', note: 'Gentle, natural motion. Quickest.' },
  { id: 'fal-ai/minimax/hailuo-02/pro/image-to-video', label: 'Smooth · high quality', tail: 'end_image_url', note: 'Crisper, more detail. A bit slower.' },
  { id: 'fal-ai/kling-video/v1.6/pro/image-to-video', label: 'Cinematic · most motion', tail: 'tail_image_url', note: 'Boldest, most dynamic motion. Slowest.' },
]

type Stage = 'idle' | 'generating' | 'matting' | 'packing' | 'done'

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
  saveAnimAlpha,
}: {
  thumb: Thumbnail
  saveAnim: (id: string, url: string | null, prompt: string | null) => Promise<void>
  saveAnimAlpha: (id: string, path: string | null) => Promise<void>
}) {
  const [prompt, setPrompt] = useState('')
  const [loopModel, setLoopModel] = useState(LOOP_MODELS[0].id)
  const [stage, setStage] = useState<Stage>('idle')
  // last matted (transparent) clip produced this session, for download
  const [matted, setMatted] = useState<string | null>(thumb.anim_video_url ?? null)
  const [error, setError] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const startRef = useRef(0)
  const busy = stage === 'generating' || stage === 'matting' || stage === 'packing'

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

  // Auto-upgrade legacy clips: a game animated before alpha-packing existed has a
  // WebM but no MP4, so it's black on iOS Safari. The first time a designer opens
  // it we pack + save the MP4 in the background (once), migrating it silently.
  const upgradingRef = useRef<string | null>(null)
  useEffect(() => {
    if (!thumb.anim_video_url || thumb.anim_alpha_path) return
    if (!canPackAlpha() || upgradingRef.current === thumb.id) return
    upgradingRef.current = thumb.id
    ;(async () => {
      try {
        const alphaUrl = await packAndUploadAlpha(thumb.id, thumb.anim_video_url!)
        await saveAnimAlpha(thumb.id, alphaUrl)
      } catch (e) {
        console.warn('alpha upgrade failed', e)
      }
    })()
  }, [thumb.id, thumb.anim_video_url, thumb.anim_alpha_path, saveAnimAlpha])

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
      try {
        const padded = await padToBucket(imageUrl)
        imageUrl = padded.imageUrl
      } catch {
        /* CORS/taint → fall back to the raw url */
      }
      // Every motion style loops: set the model's end/tail frame equal to the
      // head frame so the clip starts and ends on frame 1.
      const spec = LOOP_MODELS.find((m) => m.id === loopModel) ?? LOOP_MODELS[0]
      const gen = await supabase.functions.invoke('fal-animate', {
        body: { action: 'generate', imageUrl, prompt: fullPrompt, model: spec.id, extra: { [spec.tail]: imageUrl } },
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

      // 4 — pack an alpha H.264 MP4 so the clip is transparent on EVERY browser.
      // iOS Safari can't decode the WebM's alpha (it paints it black); the packed
      // MP4 + <AlphaVideo> shader fixes that. Best-effort — the WebM already works
      // in Chrome/Firefox, so a pack failure isn't fatal.
      try {
        if (canPackAlpha()) {
          setStage('packing')
          const alphaUrl = await packAndUploadAlpha(thumb.id, finalVideo)
          await saveAnimAlpha(thumb.id, alphaUrl)
        }
      } catch (e) {
        console.warn('alpha pack failed', e)
      }
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
        <p className="text-[11px] font-semibold text-zinc-300">Generative motion · AI</p>
        {inserted && <span className="rounded-full bg-accent/20 px-2 py-0.5 text-[10px] font-semibold text-accent">● inserted</span>}
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
      <div className="space-y-1">
        <select
          value={loopModel}
          onChange={(e) => setLoopModel(e.target.value)}
          disabled={busy}
          className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-xs outline-none focus:border-zinc-500 disabled:opacity-60"
        >
          {LOOP_MODELS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
        <p className="text-[11px] text-zinc-500">
          {LOOP_MODELS.find((m) => m.id === loopModel)?.note} · always a seamless loop.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={animate}
          disabled={busy}
          className="flex-1 rounded-lg bg-accent py-2 text-sm font-semibold text-zinc-900 hover:bg-accent-dark disabled:opacity-60"
        >
          {stage === 'generating'
            ? `Animating… ${elapsed}s`
            : stage === 'matting'
              ? `Cutting out… ${elapsed}s`
              : stage === 'packing'
                ? 'Encoding for Safari…'
                : inserted
                  ? 'Regenerate'
                  : 'Animate & insert'}
        </button>
        {matted && !busy && (
          <button onClick={download} className="flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-2 text-xs font-medium text-zinc-200 hover:bg-zinc-800">
            <Download size={14} /> webm
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
            <div className="h-full w-2/5 animate-pulse rounded-full bg-accent" />
          </div>
          <p className="text-[11px] text-zinc-500">
            {stage === 'generating'
              ? 'Rendering the clip'
              : stage === 'matting'
                ? 'Removing background (alpha matte)'
                : 'Packing a cross-browser (Safari) MP4'} · {elapsed}s
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
