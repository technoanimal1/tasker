import { useEffect, useRef, useState } from 'react'
import { supabase, figmaProxyUrl } from '../lib/supabase'
import type { Thumbnail } from '../lib/thumb'

const MODELS = [
  { id: 'fal-ai/ltx-video/image-to-video', label: 'LTX · fast & cheap' },
  { id: 'fal-ai/wan-i2v', label: 'Wan 2.1 · balanced' },
  { id: 'fal-ai/kling-video/v1.6/standard/image-to-video', label: 'Kling · best' },
]

type Phase = 'idle' | 'submitting' | 'polling' | 'done' | 'error'

export function GenerativeMotion({ thumb }: { thumb: Thumbnail }) {
  const [prompt, setPrompt] = useState('')
  const [model, setModel] = useState(MODELS[1].id)
  const [phase, setPhase] = useState<Phase>('idle')
  const [video, setVideo] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState('')
  const [progress, setProgress] = useState<number | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const alive = useRef(true)
  const startRef = useRef(0)

  useEffect(() => {
    setPrompt('')
    setVideo(null)
    setPhase('idle')
    setError(null)
    setProgress(null)
    setStatus('')
  }, [thumb.id])

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  // elapsed timer while busy
  const busy = phase === 'submitting' || phase === 'polling'
  useEffect(() => {
    if (!busy) return
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - startRef.current) / 1000)), 250)
    return () => clearInterval(id)
  }, [busy])

  async function generate() {
    const fk = thumb.figma_file_key
    const kv = thumb.figma_kv_node
    if (!fk || !kv) {
      setError('This game has no key-visual node to animate.')
      setPhase('error')
      return
    }
    setError(null)
    setVideo(null)
    setProgress(null)
    setStatus('Submitting…')
    setPhase('submitting')
    startRef.current = Date.now()
    setElapsed(0)
    const imageUrl = figmaProxyUrl(fk, kv, 3)
    const fullPrompt = `${prompt.trim() || 'subtle idle animation'}. Camera locked, preserve the artwork, seamless loop.`
    try {
      const { data, error: e } = await supabase.functions.invoke('fal-animate', {
        body: { action: 'submit', imageUrl, prompt: fullPrompt, model },
      })
      if (e || data?.error || !data?.statusUrl) {
        setError(data?.error || e?.message || 'Could not start generation.')
        setPhase('error')
        return
      }
      setPhase('polling')
      setStatus('In queue…')
      pollLoop(data.statusUrl, data.responseUrl)
    } catch (err) {
      setError(String(err))
      setPhase('error')
    }
  }

  async function pollLoop(statusUrl: string, responseUrl: string) {
    for (let i = 0; i < 120 && alive.current; i++) {
      await new Promise((r) => setTimeout(r, 2000))
      if (!alive.current) return
      const { data } = await supabase.functions.invoke('fal-animate', {
        body: { action: 'poll', statusUrl, responseUrl },
      })
      if (!data) continue
      if (data.status === 'COMPLETED') {
        if (data.video) {
          setVideo(data.video)
          setPhase('done')
          setStatus('')
        } else {
          setError('Finished but no video URL found. Raw: ' + JSON.stringify(data.raw).slice(0, 300))
          setPhase('error')
        }
        return
      }
      if (data.status === 'ERROR') {
        setError(data.error || 'Generation failed.')
        setPhase('error')
        return
      }
      setProgress(typeof data.progress === 'number' ? data.progress : null)
      setStatus(
        data.status === 'IN_QUEUE'
          ? `In queue${data.queue != null ? ` · #${data.queue}` : ''}…`
          : data.log
            ? data.log.slice(0, 60)
            : 'Rendering…',
      )
    }
    if (alive.current) {
      setError('Timed out waiting for the clip.')
      setPhase('error')
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
            <div
              className={`h-full rounded-full bg-brand ${progress == null ? 'animate-pulse' : ''}`}
              style={{ width: progress != null ? `${progress}%` : '40%' }}
            />
          </div>
          <p className="text-[11px] text-zinc-500">
            {status || 'Working…'} · {elapsed}s{progress != null ? ` · ${progress}%` : ''}
          </p>
        </div>
      )}
      {error && <p className="text-[11px] text-red-400">{error}</p>}
      {!video && phase === 'idle' && (
        <p className="text-[11px] text-zinc-500">Animates the key visual with fal.ai · ~$0.05–0.30/clip · not stored — download to keep.</p>
      )}
    </div>
  )
}
