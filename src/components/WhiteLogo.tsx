import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Thumbnail } from '../lib/thumb'

// White-logo engines. All extract/redraw the wordmark; cost & quality differ.
const ENGINES = [
  { id: 'knockout', label: 'Knockout · free', note: 'alpha→white · transparent, best for clean wordmark logos' },
  { id: 'ai', label: 'Gemini · fast', note: 'nano-banana + auto background removal · transparent' },
  { id: 'gpt', label: 'ChatGPT · best', note: 'gpt-image-1 · cleanest, but needs OpenAI credits' },
]

export function WhiteLogo({
  thumb,
  saveLogoWhite,
  saveLogoColor,
}: {
  thumb: Thumbnail
  saveLogoWhite: (id: string, url: string | null) => Promise<void>
  saveLogoColor: (id: string, url: string | null) => Promise<void>
}) {
  const [engine, setEngine] = useState('knockout')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [url, setUrl] = useState<string | null>(thumb.logo_white_url ?? null)
  const startRef = useRef(0)
  // Refine AI flow: re-typeset colour logotype (keep branding) → white. Separate busy/stage.
  const [vBusy, setVBusy] = useState(false)
  const [vStage, setVStage] = useState<'color' | 'white' | ''>('')
  // Optional desired line breaks, e.g. "All Ways / Hottest / Fruits".
  const [lines, setLines] = useState('')

  async function refine() {
    const fk = thumb.figma_file_key
    const node = thumb.figma_logo_color_node
    if (!fk || !node) {
      setError('This game has no colour logo to refine.')
      return
    }
    setError(null)
    setVBusy(true)
    try {
      // 1 — AI re-typesets the colour logotype into a cleaner, more readable
      // multi-line stack, keeping the original branding. Sourced from the
      // ORIGINAL Figma colour node (so re-refining never compounds artefacts).
      setVStage('color')
      const step1 = await supabase.functions.invoke('logo-white', {
        body: { fileKey: fk, node, slug: `${thumb.slug}-v`, mode: 'refine', lines: lines.trim() },
      })
      let b1: { error?: string; url?: string } | null = step1.data ?? null
      if (step1.error && 'context' in step1.error) {
        try { b1 = await (step1.error as unknown as { context: Response }).context.json() } catch { /* keep */ }
      }
      if (step1.error || !b1?.url) throw new Error(b1?.error || step1.error?.message || 'Logo refinement failed.')
      const refinedColor = b1.url
      await saveLogoColor(thumb.id, `${refinedColor}?v=${Date.now()}`)

      // 2 — whiten the (now transparent) refined colour logotype deterministically
      // (alpha→white) so the result stays transparent — no AI background artefacts.
      setVStage('white')
      const step2 = await supabase.functions.invoke('logo-white', {
        body: { imageUrl: refinedColor, slug: thumb.slug, mode: 'knockout' },
      })
      let b2: { error?: string; url?: string } | null = step2.data ?? null
      if (step2.error && 'context' in step2.error) {
        try { b2 = await (step2.error as unknown as { context: Response }).context.json() } catch { /* keep */ }
      }
      if (step2.error || !b2?.url) throw new Error(b2?.error || step2.error?.message || 'White step failed.')
      const busted = `${b2.url}?v=${Date.now()}`
      await saveLogoWhite(thumb.id, busted)
      setUrl(busted)
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err)
      setError(/credit/i.test(raw) ? 'AI is out of credits.' : raw)
    } finally {
      setVBusy(false)
      setVStage('')
    }
  }

  useEffect(() => {
    setUrl(thumb.logo_white_url ?? null)
    setError(null)
    setBusy(false)
  }, [thumb.id, thumb.logo_white_url])

  useEffect(() => {
    if (!busy) return
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - startRef.current) / 1000)), 200)
    return () => clearInterval(id)
  }, [busy])

  async function generate() {
    const fk = thumb.figma_file_key
    const node = thumb.figma_logo_color_node
    if (!fk || !node) {
      setError('This game has no colour logo to convert.')
      return
    }
    setError(null)
    setElapsed(0)
    startRef.current = Date.now()
    setBusy(true)
    try {
      const { data, error: e } = await supabase.functions.invoke('logo-white', {
        body: { fileKey: fk, node, slug: thumb.slug, mode: engine },
      })
      // On a non-2xx, supabase-js gives a generic message; read the function's
      // JSON body for the real reason (e.g. OpenAI out of credits).
      let body: { error?: string; url?: string } | null = data ?? null
      if (e && 'context' in e) {
        try { body = await (e as unknown as { context: Response }).context.json() } catch { /* keep generic */ }
      }
      if (e || !body?.url) {
        const raw = body?.error || e?.message || 'White logo generation failed.'
        setError(/credit/i.test(raw) ? 'OpenAI is out of credits — add credits to generate white logos.' : raw)
      } else {
        // cache-bust: the storage path is stable, so version it so the new image shows
        const busted = `${body.url}?v=${Date.now()}`
        await saveLogoWhite(thumb.id, busted)
        setUrl(busted)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  if (!thumb.figma_logo_color_node) return null
  const spec = ENGINES.find((x) => x.id === engine)

  return (
    <div className="space-y-2 border-t border-zinc-800 pt-3">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold text-zinc-300">White logotype · AI</p>
        {url && <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-semibold text-accent">● ready</span>}
      </div>

      {url && (
        <img
          src={url}
          alt="white logo"
          className="max-h-24 w-full rounded-lg border border-zinc-800 object-contain p-2 [background-image:linear-gradient(45deg,#222_25%,transparent_25%),linear-gradient(-45deg,#222_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#222_75%),linear-gradient(-45deg,transparent_75%,#222_75%)] [background-position:0_0,0_6px,6px_-6px,-6px_0] [background-size:12px_12px]"
        />
      )}

      <select
        value={engine}
        onChange={(e) => setEngine(e.target.value)}
        disabled={busy}
        className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-xs outline-none focus:border-accent disabled:opacity-60"
      >
        {ENGINES.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label}
          </option>
        ))}
      </select>
      <p className="text-[11px] text-zinc-500">{spec?.note}</p>

      <button
        onClick={generate}
        disabled={busy || vBusy}
        className="w-full rounded-lg bg-accent py-2 text-sm font-semibold text-zinc-900 hover:bg-accent-dark disabled:opacity-60"
      >
        {busy ? `Generating… ${elapsed}s` : url ? 'Regenerate wordmark' : 'Make white logo'}
      </button>

      <div className="space-y-1.5 rounded-lg border border-zinc-800 bg-zinc-900/40 p-2">
        <p className="text-[11px] font-semibold text-zinc-300">Refine layout · AI</p>
        <p className="text-[11px] text-zinc-500">
          Re-typesets the colour logotype into cleaner, more readable lines (keeps the branding), then makes the white version.
        </p>
        <input
          value={lines}
          onChange={(e) => setLines(e.target.value)}
          disabled={busy || vBusy}
          placeholder="Line breaks (optional) — e.g. All Ways / Hottest / Fruits"
          className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-xs text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-accent disabled:opacity-60"
        />
        <button
          onClick={refine}
          disabled={busy || vBusy}
          title="AI: re-typeset the colour logotype into readable lines (keep branding), then whiten it"
          className="w-full rounded-lg border border-zinc-700 py-2 text-sm font-medium text-zinc-200 transition hover:bg-zinc-800 disabled:opacity-60"
        >
          {vBusy
            ? vStage === 'color'
              ? 'Refining colour…'
              : 'Whitening…'
            : 'Refine logo (AI)'}
        </button>
      </div>

      {error && <p className="text-[11px] text-red-400">{error}</p>}
      {!error && !busy && (
        <p className="text-[11px] text-zinc-500">Set the logo variant to “white” (Logo style) to show it on the thumbnail.</p>
      )}
    </div>
  )
}
