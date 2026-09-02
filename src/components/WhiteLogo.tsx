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
  // Refine AI flow: re-typeset colour logotype (keep branding). Produces a DRAFT
  // (before/after preview) you can re-roll; nothing is saved until you Apply.
  const [vBusy, setVBusy] = useState(false)
  const [applying, setApplying] = useState(false)
  // Optional desired line breaks, e.g. "All Ways / Hottest / Fruits".
  const [lines, setLines] = useState('')
  // Uncommitted refinement: original (source) vs colour (refined, transparent).
  const [draft, setDraft] = useState<{ original: string; color: string; stamp: number } | null>(null)

  // Re-typeset the ORIGINAL colour logotype into a cleaner multi-line stack.
  // Sourced from the original Figma colour node every time so re-rolls never
  // compound artefacts. Returns a draft for preview — does NOT save.
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
      const step1 = await supabase.functions.invoke('logo-white', {
        body: { fileKey: fk, node, slug: `${thumb.slug}-v`, mode: 'refine', lines: lines.trim() },
      })
      let b1: { error?: string; url?: string; original?: string } | null = step1.data ?? null
      if (step1.error && 'context' in step1.error) {
        try { b1 = await (step1.error as unknown as { context: Response }).context.json() } catch { /* keep */ }
      }
      if (step1.error || !b1?.url) throw new Error(b1?.error || step1.error?.message || 'Logo refinement failed.')
      setDraft({ original: b1.original ?? '', color: b1.url, stamp: Date.now() })
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err)
      setError(/credit/i.test(raw) ? 'AI is out of credits.' : raw)
    } finally {
      setVBusy(false)
    }
  }

  // Commit the current draft: save the refined colour, then make the white
  // version from it (deterministic alpha→white, so it stays transparent).
  async function applyRefine() {
    if (!draft) return
    setError(null)
    setApplying(true)
    try {
      await saveLogoColor(thumb.id, `${draft.color}?v=${draft.stamp}`)
      const step2 = await supabase.functions.invoke('logo-white', {
        body: { imageUrl: draft.color, slug: thumb.slug, mode: 'knockout' },
      })
      let b2: { error?: string; url?: string } | null = step2.data ?? null
      if (step2.error && 'context' in step2.error) {
        try { b2 = await (step2.error as unknown as { context: Response }).context.json() } catch { /* keep */ }
      }
      if (step2.error || !b2?.url) throw new Error(b2?.error || step2.error?.message || 'White step failed.')
      const busted = `${b2.url}?v=${Date.now()}`
      await saveLogoWhite(thumb.id, busted)
      setUrl(busted)
      setDraft(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setApplying(false)
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
    <div className="space-y-2 border-t border-ring pt-3">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold text-muted">White logotype · AI</p>
        {url && <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-semibold text-accent">● ready</span>}
      </div>

      {url && (
        <img
          src={url}
          alt="white logo"
          className="max-h-24 w-full rounded-lg border border-ring object-contain p-2 [background-image:linear-gradient(45deg,#222_25%,transparent_25%),linear-gradient(-45deg,#222_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#222_75%),linear-gradient(-45deg,transparent_75%,#222_75%)] [background-position:0_0,0_6px,6px_-6px,-6px_0] [background-size:12px_12px]"
        />
      )}

      <select
        value={engine}
        onChange={(e) => setEngine(e.target.value)}
        disabled={busy}
        className="w-full rounded-md border border-white/[0.16] bg-white/[0.06] px-2 py-1.5 text-xs outline-none focus:border-accent disabled:opacity-60"
      >
        {ENGINES.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label}
          </option>
        ))}
      </select>
      <p className="text-[11px] text-dim">{spec?.note}</p>

      <button
        onClick={generate}
        disabled={busy || vBusy}
        className="w-full rounded-lg bg-white py-2 text-sm font-semibold text-black hover:bg-yellow disabled:opacity-60"
      >
        {busy ? `Generating… ${elapsed}s` : url ? 'Regenerate wordmark' : 'Make white logo'}
      </button>

      <div className="space-y-1.5 rounded-lg border border-ring bg-panel p-2">
        <p className="text-[11px] font-semibold text-muted">Refine layout · AI</p>
        <p className="text-[11px] text-dim">
          Re-typesets the colour logotype into cleaner, more readable lines (keeps the branding). Preview and re-roll, then Apply to also make the white version.
        </p>
        <input
          value={lines}
          onChange={(e) => setLines(e.target.value)}
          disabled={busy || vBusy || applying}
          placeholder="Line breaks (optional) — e.g. All Ways / Hottest / Fruits"
          className="w-full rounded-md border border-white/[0.16] bg-white/[0.06] px-2 py-1.5 text-xs text-white outline-none placeholder:text-dim focus:border-accent disabled:opacity-60"
        />

        {draft && (
          <div className="space-y-1.5">
            <div className="grid grid-cols-2 gap-1.5">
              <figure className="space-y-1">
                <figcaption className="text-center text-[10px] font-medium uppercase tracking-wide text-dim">Before</figcaption>
                <img
                  src={draft.original}
                  alt="original logo"
                  className="h-20 w-full rounded-md border border-ring object-contain p-1.5 [background-image:linear-gradient(45deg,#222_25%,transparent_25%),linear-gradient(-45deg,#222_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#222_75%),linear-gradient(-45deg,transparent_75%,#222_75%)] [background-position:0_0,0_6px,6px_-6px,-6px_0] [background-size:12px_12px]"
                />
              </figure>
              <figure className="space-y-1">
                <figcaption className="text-center text-[10px] font-medium uppercase tracking-wide text-accent">After</figcaption>
                <img
                  src={`${draft.color}?v=${draft.stamp}`}
                  alt="refined logo"
                  className="h-20 w-full rounded-md border border-accent/40 object-contain p-1.5 [background-image:linear-gradient(45deg,#222_25%,transparent_25%),linear-gradient(-45deg,#222_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#222_75%),linear-gradient(-45deg,transparent_75%,#222_75%)] [background-position:0_0,0_6px,6px_-6px,-6px_0] [background-size:12px_12px]"
                />
              </figure>
            </div>
            <div className="flex gap-1.5">
              <button
                onClick={applyRefine}
                disabled={applying || vBusy}
                className="flex-1 rounded-lg bg-white py-2 text-xs font-semibold text-black transition hover:bg-yellow disabled:opacity-60"
              >
                {applying ? 'Applying…' : 'Apply + make white'}
              </button>
              <button
                onClick={refine}
                disabled={applying || vBusy}
                title="Generate another take from the original"
                className="rounded-lg border border-white/[0.16] px-3 py-2 text-xs font-medium text-white transition hover:bg-white/[0.06] disabled:opacity-60"
              >
                {vBusy ? 'Re-rolling…' : 'Re-roll'}
              </button>
              <button
                onClick={() => setDraft(null)}
                disabled={applying || vBusy}
                title="Discard this draft"
                className="rounded-lg border border-white/[0.16] px-3 py-2 text-xs font-medium text-muted transition hover:bg-white/[0.06] disabled:opacity-60"
              >
                Discard
              </button>
            </div>
          </div>
        )}

        {!draft && (
          <button
            onClick={refine}
            disabled={busy || vBusy}
            title="AI: re-typeset the colour logotype into readable lines (keep branding)"
            className="w-full rounded-lg border border-white/[0.16] py-2 text-sm font-medium text-white transition hover:bg-white/[0.06] disabled:opacity-60"
          >
            {vBusy ? 'Refining colour…' : 'Refine logo (AI)'}
          </button>
        )}
      </div>

      {error && <p className="text-[11px] text-red-400">{error}</p>}
      {!error && !busy && (
        <p className="text-[11px] text-dim">Set the logo variant to “white” (Logo style) to show it on the thumbnail.</p>
      )}
    </div>
  )
}
