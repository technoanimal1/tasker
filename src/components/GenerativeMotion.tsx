import { useEffect, useRef, useState } from 'react'
import { supabase, figmaProxyUrl } from '../lib/supabase'
import type { Thumbnail } from '../lib/thumb'

const MODELS = [
  { id: 'fal-ai/ltx-video-13b-distilled/image-to-video', label: 'LTX distilled · ⚡ ~20s' },
  { id: 'fal-ai/ltx-2.3/image-to-video/fast', label: 'LTX-2.3 Fast' },
  { id: 'fal-ai/wan-i2v', label: 'Wan 2.1 · balanced' },
  { id: 'fal-ai/kling-video/v1.6/standard/image-to-video', label: 'Kling · best (slow)' },
]

export function GenerativeMotion({ thumb }: { thumb: Thumbnail }) {
  const [prompt, setPrompt] = useState('')
  const [model, setModel] = useState(MODELS[0].id)
  const [busy, setBusy] = useState(false)
  const [video, setVideo] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const startRef = useRef(0)

  useEffect(() => {
    setPrompt('')
    setVideo(null)
    setError(null)
    setBusy(false)
  }, [thumb.id])

  useEffect(() => {
    if (!busy) return
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - startRef.current) / 1000)), 200)
    return () => clearInterval(id)
  }, [busy])

  async function generate() {
    const fk = thumb.figma_file_key
    const kv = thumb.figma_kv_node
    if (!fk || !kv) {
      setError('This game has no key-visual node to animate.')
      return
    }
    setError(null)
    setVideo(null)
    setElapsed(0)
    startRef.current = Date.now()
    setBusy(true)
    const imageUrl = figmaProxyUrl(fk, kv, 2)
    const fullPrompt = `${prompt.trim() || 'subtle idle animation'}. Camera locked, preserve the artwork, seamless loop.`
    try {
      const { data, error: e } = await supabase.functions.invoke('fal-animate', {
        body: { action: 'generate', imageUrl, prompt: fullPrompt, model },
      })
      if (e || !data || data.error || !data.video) {
        setError(
          data?.error ||
            e?.message ||
            `No video returned.${data?.raw ? ' ' + JSON.stringify(data.raw).slice(0, 240) : ''}`,
        )
      } else {
        setVideo(data.video)
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setBusy(false)
    }
  }

  async function download() {
    if (!video) return
    try {
      const r = await fetch(video)
      const b = await r.blob()
      const u = URL.createObjectURL(b)
      const a = document.createElement('a')
      a.href = u
      a.download = `${thumb.slug}_motion.mp4`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(u)
    } catch {
      window.open(video, '_blank')
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">Generative motion · AI</p>

      {video && (
        <video src={video} autoPlay loop muted playsInline className="w-full rounded-lg border border-zinc-800" />
      )}

      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={3}
        placeholder="e.g. the lion roars on loop, keep artwork & proportions"
        className="w-full resize-none rounded-lg border border-zinc-700 bg-zinc-800/60 px-3 py-2 text-xs text-zinc-100 outline-none focus:border-zinc-500"
      />
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

      <div className="flex items-center gap-2">
        <button
          onClick={generate}
          disabled={busy}
          className="flex-1 rounded-lg bg-brand py-2 text-sm font-semibold text-zinc-900 hover:bg-brand-dark disabled:opacity-60"
        >
          {busy ? `Generating… ${elapsed}s` : video ? 'Regenerate' : '✨ Animate'}
        </button>
        {video && !busy && (
          <button onClick={download} className="rounded-lg border border-zinc-700 px-3 py-2 text-xs font-medium text-zinc-200 hover:bg-zinc-800">
            ⭳ Download
          </button>
        )}
      </div>

      {busy && (
        <div className="space-y-1">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
            <div className="h-full w-2/5 animate-pulse rounded-full bg-brand" />
          </div>
          <p className="text-[11px] text-zinc-500">Rendering the clip · {elapsed}s</p>
        </div>
      )}
      {error && <p className="text-[11px] text-red-400">{error}</p>}
      {!video && !busy && !error && (
        <p className="text-[11px] text-zinc-500">Animates the key visual · fal.ai · not stored — download to keep.</p>
      )}
    </div>
  )
}
