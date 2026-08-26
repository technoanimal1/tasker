import { useEffect, useRef, useState } from 'react'
import { supabase, figmaProxyUrl } from '../lib/supabase'
import type { Thumbnail } from '../lib/thumb'

const MODELS = [
  { id: 'fal-ai/ltx-video/image-to-video', label: 'LTX · fast & cheap' },
  { id: 'fal-ai/wan-i2v', label: 'Wan 2.1 · balanced' },
  { id: 'fal-ai/kling-video/v1.6/standard/image-to-video', label: 'Kling · best' },
]

type Phase = 'idle' | 'submitting' | 'polling' | 'done' | 'error'

export function GenerativeMotion({
  thumb,
  onSaved,
}: {
  thumb: Thumbnail
  onSaved: (id: string, url: string | null, prompt: string | null) => void
}) {
  const [prompt, setPrompt] = useState(thumb.anim_prompt ?? '')
  const [model, setModel] = useState(MODELS[0].id)
  const [phase, setPhase] = useState<Phase>('idle')
  const [video, setVideo] = useState<string | null>(thumb.anim_video_url ?? null)
  const [error, setError] = useState<string | null>(null)
  const alive = useRef(true)

  useEffect(() => {
    setPrompt(thumb.anim_prompt ?? '')
    setVideo(thumb.anim_video_url ?? null)
    setPhase('idle')
    setError(null)
  }, [thumb.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

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
    setPhase('submitting')
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
      pollLoop(data.statusUrl, data.responseUrl)
    } catch (err) {
      setError(String(err))
      setPhase('error')
    }
  }

  async function pollLoop(statusUrl: string, responseUrl: string) {
    for (let i = 0; i < 60 && alive.current; i++) {
      await new Promise((r) => setTimeout(r, 4000))
      if (!alive.current) return
      const { data } = await supabase.functions.invoke('fal-animate', {
        body: { action: 'poll', statusUrl, responseUrl },
      })
      if (data?.status === 'COMPLETED') {
        if (data.video) {
          setVideo(data.video)
          setPhase('done')
          onSaved(thumb.id, data.video, prompt.trim() || null)
        } else {
          setError('Finished but no video returned.')
          setPhase('error')
        }
        return
      }
      if (data?.status === 'ERROR') {
        setError(data.error || 'Generation failed.')
        setPhase('error')
        return
      }
    }
    if (alive.current) {
      setError('Timed out waiting for the clip.')
      setPhase('error')
    }
  }

  const busy = phase === 'submitting' || phase === 'polling'

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
        placeholder="e.g. the monkey blinks and waves, coins sparkle"
        className="w-full resize-none rounded-lg border border-zinc-700 bg-zinc-800/60 px-3 py-2 text-xs text-zinc-100 outline-none focus:border-zinc-500"
      />
      <select
        value={model}
        onChange={(e) => setModel(e.target.value)}
        className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-xs outline-none focus:border-zinc-500"
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
          {phase === 'submitting' ? 'Starting…' : phase === 'polling' ? 'Generating…' : video ? 'Regenerate' : '✨ Animate'}
        </button>
        {video && !busy && (
          <button
            onClick={() => {
              setVideo(null)
              onSaved(thumb.id, null, null)
            }}
            className="rounded-lg border border-zinc-700 px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-800"
          >
            Clear
          </button>
        )}
      </div>

      {phase === 'polling' && <p className="text-[11px] text-zinc-500">Rendering the clip — this takes ~30–90s.</p>}
      {error && <p className="text-[11px] text-red-400">{error}</p>}
      {!video && phase === 'idle' && (
        <p className="text-[11px] text-zinc-500">Animates the key visual with fal.ai. ~$0.05–0.30 per clip.</p>
      )}
    </div>
  )
}
