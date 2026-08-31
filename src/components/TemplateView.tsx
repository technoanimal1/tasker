import { useEffect, useMemo, useRef, useState } from 'react'
import { useTemplate } from '../hooks/useTemplate'
import { useThumbnailsData } from '../hooks/useThumbnailsData'
import { useFigmaAssets } from '../hooks/useFigmaAssets'
import {
  FRAME_SIZES,
  GRAD_DIRS,
  PROVIDER_CASES,
  PROVIDER_POSITIONS,
  defaultLayout,
  resolveGrad,
  withDefaults,
  type GradientParams,
  type ProviderPos,
  type SizeLayout,
  type TemplateParams,
} from '../lib/thumb'
import { KvControls, LogoControls, Slider, pct } from './LayoutControls'
import { ThumbnailCard } from './Thumbnail'
import { LoadingScreen, Spinner } from './Spinner'
import { ArrowDown, ArrowUp, ArrowLeft, ArrowRight, Undo2, Redo2, RotateCcw } from 'lucide-react'

/**
 * Master template controller (designer-only). One place to set logo / key-visual
 * placement and gradient per aspect size. Saving writes the global template, so
 * it applies to every thumbnail on the product.
 */
export function TemplateView() {
  const { template, loading, save } = useTemplate()
  // The catalogue loads lazily per-provider, so pull one page of games to use as
  // live preview samples for the master template (otherwise there's nothing to
  // render the template on).
  const { pageItems, loadPage, pageLoading } = useThumbnailsData()
  const { assetsFor, ensureResolved } = useFigmaAssets(pageItems)

  const [params, setParams] = useState<TemplateParams | null>(null)
  // Baseline = the last-saved params; per-size / global dirtiness is measured
  // against it, and a scoped save writes only the sizes that differ from it.
  const [base, setBase] = useState<TemplateParams | null>(null)
  const [saving, setSaving] = useState(false)
  const [previewIdx, setPreviewIdx] = useState(0)
  // The provider-label config is locked until you tap Edit (avoids stray changes).
  const [labelEdit, setLabelEdit] = useState(false)
  // Preview width tracks the viewport so the card fits on mobile (no clipping).
  const [vw, setVw] = useState(() => (typeof window !== 'undefined' ? window.innerWidth : 800))
  // Change history for undo / redo. Slider drags coalesce into one step by tag.
  const [undoStack, setUndoStack] = useState<TemplateParams[]>([])
  const [redoStack, setRedoStack] = useState<TemplateParams[]>([])
  const lastTag = useRef<{ tag: string; t: number }>({ tag: '', t: 0 })

  useEffect(() => {
    if (template) {
      const wd = withDefaults(template.params)
      setParams(wd)
      setBase(wd)
      setUndoStack([])
      setRedoStack([])
    }
  }, [template])

  useEffect(() => {
    loadPage(0, 24)
  }, [loadPage])

  useEffect(() => {
    const onR = () => setVw(window.innerWidth)
    window.addEventListener('resize', onR)
    return () => window.removeEventListener('resize', onR)
  }, [])

  // Which aspect sizes differ from the saved baseline (layout or gradient).
  const editedSizes = useMemo(() => {
    const set = new Set<string>()
    if (!params || !base) return set
    for (const s of FRAME_SIZES) {
      const layDiff = JSON.stringify(params.layouts?.[s.key] ?? null) !== JSON.stringify(base.layouts?.[s.key] ?? null)
      const grDiff = JSON.stringify(params.gradients?.[s.key] ?? null) !== JSON.stringify(base.gradients?.[s.key] ?? null)
      if (layDiff || grDiff) set.add(s.key)
    }
    return set
  }, [params, base])

  // Product-wide (non-per-size) fields that differ from the baseline.
  const globalsDirty = useMemo(() => {
    if (!params || !base) return false
    const strip = (p: TemplateParams) => {
      const { layouts: _l, gradients: _g, sizeKey: _s, ...rest } = p
      return rest
    }
    return JSON.stringify(strip(params)) !== JSON.stringify(strip(base))
  }, [params, base])

  const dirty = editedSizes.size > 0 || globalsDirty

  // A single mutation: snapshot the pre-change state for undo (coalescing rapid
  // same-tag edits like a slider drag), clear redo, then apply the change.
  const mutate = (tag: string, fn: (p: TemplateParams) => TemplateParams) => {
    if (!params) return
    const now = Date.now()
    const coalesce = lastTag.current.tag === tag && now - lastTag.current.t < 700
    lastTag.current = { tag, t: now }
    if (!coalesce) {
      setUndoStack((s) => [...s.slice(-99), params])
      setRedoStack([])
    }
    setParams(fn(params))
  }

  function undo() {
    if (!undoStack.length || !params) return
    const prev = undoStack[undoStack.length - 1]
    setUndoStack((s) => s.slice(0, -1))
    setRedoStack((r) => [...r, params])
    setParams(prev)
    lastTag.current = { tag: '', t: 0 }
  }
  function redo() {
    if (!redoStack.length || !params) return
    const next = redoStack[redoStack.length - 1]
    setRedoStack((r) => r.slice(0, -1))
    setUndoStack((s) => [...s, params])
    setParams(next)
    lastTag.current = { tag: '', t: 0 }
  }

  // Cmd/Ctrl+Z → undo, Cmd/Ctrl+Shift+Z (or Ctrl+Y) → redo.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return
      const k = e.key.toLowerCase()
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'TEXTAREA') return
      if (k === 'z') {
        e.preventDefault()
        e.shiftKey ? redo() : undo()
      } else if (k === 'y') {
        e.preventDefault()
        redo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }) // eslint-disable-line react-hooks/exhaustive-deps

  const sample = pageItems[previewIdx] ?? pageItems[0] ?? null

  // Resolve the sample's Figma-only layers (assets not yet on our CDN) on demand.
  useEffect(() => {
    if (sample) ensureResolved(sample)
  }, [sample, ensureResolved])

  if (loading || !params) {
    return <LoadingScreen label="Loading template…" />
  }

  // Desktop shows a large preview; mobile pins a small tile so you can watch the
  // design change while the controls scroll beneath it.
  const isWide = vw >= 1024
  const previewW = isWide ? 360 : 150

  const sizeKey = params.sizeKey
  const lay = params.layouts?.[sizeKey] ?? defaultLayout(sizeKey)
  const grad = resolveGrad(params)

  // Switching the previewed aspect isn't an edit — no history entry.
  const setSize = (key: string) => setParams((p) => (p ? { ...p, sizeKey: key } : p))
  const setLayout = (patch: Partial<SizeLayout>) =>
    mutate(`layout:${params?.sizeKey}:${Object.keys(patch).join(',')}`, (p) => {
      const cur = p.layouts?.[p.sizeKey] ?? defaultLayout(p.sizeKey)
      return { ...p, layouts: { ...(p.layouts ?? {}), [p.sizeKey]: { ...cur, ...patch } } }
    })
  const setGrad = (patch: Partial<GradientParams>) =>
    mutate(`grad:${params?.sizeKey}:${Object.keys(patch).join(',')}`, (p) => {
      const cur = resolveGrad(p)
      return { ...p, gradients: { ...(p.gradients ?? {}), [p.sizeKey]: { ...cur, ...patch } } }
    })
  // Provider label styling is product-wide (not per aspect size).
  const setP = (patch: Partial<TemplateParams>) => mutate(`global:${Object.keys(patch).join(',')}`, (p) => ({ ...p, ...patch }))

  // Copy the current size's KV + logo layout (alignment, size, offsets) onto every
  // aspect size, so a proportion tuned here can be applied to all sizes at once.
  const applyLayoutToAll = () =>
    mutate('apply-all', (p) => {
      const cur = p.layouts?.[p.sizeKey] ?? defaultLayout(p.sizeKey)
      const layouts = { ...(p.layouts ?? {}) }
      for (const s of FRAME_SIZES) layouts[s.key] = { ...cur }
      return { ...p, layouts }
    })

  // Revert one aspect size's layout + gradient back to the saved baseline.
  const resetSize = (key: string) =>
    mutate(`reset:${key}`, (p) => {
      const layouts = { ...(p.layouts ?? {}) }
      const gradients = { ...(p.gradients ?? {}) }
      if (base?.layouts?.[key]) layouts[key] = base.layouts[key]
      else delete layouts[key]
      if (base?.gradients?.[key]) gradients[key] = base.gradients[key]
      else delete gradients[key]
      return { ...p, layouts, gradients }
    })

  // Save only the sizes that were edited: start from the saved baseline and
  // overlay just the changed sizes (+ any global fields), so aspect sizes you
  // didn't touch are persisted exactly as they were.
  async function saveEdited() {
    if (!params || !base) return
    setSaving(true)
    try {
      const next: TemplateParams = { ...(globalsDirty ? params : base) }
      const layouts = { ...(base.layouts ?? {}) }
      const gradients = { ...(base.gradients ?? {}) }
      for (const s of editedSizes) {
        if (params.layouts?.[s]) layouts[s] = params.layouts[s]
        else delete layouts[s]
        if (params.gradients?.[s]) gradients[s] = params.gradients[s]
        else delete gradients[s]
      }
      next.layouts = layouts
      next.gradients = gradients
      next.sizeKey = params.sizeKey
      await save(next)
      setBase(next)
      setParams(next)
      setUndoStack([])
      setRedoStack([])
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Template controller</h1>
          <p className="text-sm text-zinc-400">
            Master layout &amp; gradient <b>per aspect size</b>. Saving writes only the sizes you edited.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            onClick={undo}
            disabled={!undoStack.length}
            title="Undo (⌘Z)"
            aria-label="Undo"
            className="grid h-9 w-9 place-items-center rounded-lg border border-zinc-700 text-zinc-200 transition hover:bg-zinc-800 disabled:opacity-40"
          >
            <Undo2 size={16} />
          </button>
          <button
            onClick={redo}
            disabled={!redoStack.length}
            title="Redo (⌘⇧Z)"
            aria-label="Redo"
            className="grid h-9 w-9 place-items-center rounded-lg border border-zinc-700 text-zinc-200 transition hover:bg-zinc-800 disabled:opacity-40"
          >
            <Redo2 size={16} />
          </button>
          <button
            onClick={saveEdited}
            disabled={saving || !dirty}
            title={dirty ? `Save ${editedSizes.size ? `${editedSizes.size} size${editedSizes.size > 1 ? 's' : ''}` : 'changes'}${globalsDirty ? (editedSizes.size ? ' + label' : 'label') : ''}` : 'Nothing to save'}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-zinc-900 hover:bg-accent-dark disabled:opacity-50"
          >
            {saving
              ? 'Saving…'
              : dirty
                ? `Save${editedSizes.size ? ` ${editedSizes.size} size${editedSizes.size > 1 ? 's' : ''}` : ' changes'}`
                : 'Saved'}
          </button>
        </div>
      </div>

      {/* aspect switcher — a dot marks a size with unsaved edits */}
      <div className="mb-5 flex flex-wrap items-center gap-1.5">
        {FRAME_SIZES.map((s) => {
          const edited = editedSizes.has(s.key)
          return (
            <button
              key={s.key}
              onClick={() => setSize(s.key)}
              title={edited ? `${s.key} · edited (unsaved)` : s.key}
              className={`relative rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                sizeKey === s.key ? 'bg-accent text-zinc-900' : 'bg-zinc-800/70 text-zinc-300 hover:bg-zinc-700'
              }`}
            >
              {s.key}
              {edited && (
                <span
                  className={`absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full ring-2 ${
                    sizeKey === s.key ? 'bg-zinc-900 ring-accent' : 'bg-accent ring-zinc-900'
                  }`}
                />
              )}
            </button>
          )
        })}
        {editedSizes.has(sizeKey) && (
          <button
            onClick={() => resetSize(sizeKey)}
            title={`Revert ${sizeKey} to the saved version`}
            className="flex items-center gap-1 rounded-lg border border-zinc-700 px-2.5 py-1.5 text-xs font-medium text-zinc-300 transition hover:bg-zinc-800"
          >
            <RotateCcw size={13} /> Reset {sizeKey}
          </button>
        )}
        <button
          onClick={applyLayoutToAll}
          title="Copy this size's KV + logo alignment, size and offsets to every aspect size"
          className="ml-auto rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:bg-zinc-800"
        >
          Apply KV + logo to all sizes
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* preview */}
        <div
          className="sticky top-2 z-20 flex min-h-0 items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-950/85 p-3 backdrop-blur lg:static lg:min-h-[520px] lg:bg-transparent lg:p-8 lg:backdrop-blur-0"
          style={{ backgroundImage: 'radial-gradient(circle at center, #1a1c22 1px, transparent 1px)', backgroundSize: '22px 22px' }}
        >
          {sample ? (
            <div className="shadow-2xl">
              <ThumbnailCard thumb={sample} params={params} assets={assetsFor(sample)} displayW={previewW} showFrame />
            </div>
          ) : pageLoading ? (
            <div className="flex items-center gap-2 text-sm text-zinc-500">
              <Spinner size={18} /> Loading a preview game…
            </div>
          ) : (
            <p className="text-sm text-zinc-500">No thumbnails to preview yet.</p>
          )}
        </div>

        {/* controls */}
        <aside className="flex flex-col gap-3.5 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-3">
          {pageItems.length > 1 && (
            <Row label="Preview game">
              <select
                value={previewIdx}
                onChange={(e) => setPreviewIdx(Number(e.target.value))}
                className="max-w-[200px] rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs outline-none focus:border-zinc-500"
              >
                {pageItems.map((t, i) => (
                  <option key={t.id} value={i}>
                    {t.name}
                  </option>
                ))}
              </select>
            </Row>
          )}

          <Section title={`Key visual · ${sizeKey}`}>
            <KvControls
              lay={lay}
              autoCenter={params.kvAutoCenter ?? true}
              onLayout={setLayout}
              onAutoCenter={(v) => setP({ kvAutoCenter: v })}
            />
          </Section>

          <Section title={`Logo · ${sizeKey}`}>
            <LogoControls lay={lay} onLayout={setLayout} />
          </Section>

          <Section title={`Gradient · ${sizeKey}`}>
            <Row label="Direction">
              <div className="flex gap-1">
                {GRAD_DIRS.map((d) => (
                  <button
                    key={d}
                    onClick={() => setGrad({ gradDir: d })}
                    title={d}
                    className={`grid h-7 w-7 place-items-center rounded-md border text-sm transition ${
                      grad.gradDir === d ? 'border-accent bg-accent/15 text-accent' : 'border-zinc-700 text-zinc-400 hover:bg-zinc-800'
                    }`}
                  >
                    {d === 'bottom' ? <ArrowDown size={14} /> : d === 'top' ? <ArrowUp size={14} /> : d === 'left' ? <ArrowLeft size={14} /> : <ArrowRight size={14} />}
                  </button>
                ))}
              </div>
            </Row>
            <Slider label="Top fade" min={0} max={100} value={grad.gradStop1} onChange={(v) => setGrad({ gradStop1: v })} fmt={(v) => `${Math.round(v)}%`} />
            <Slider label="Colour stop" min={0} max={100} value={grad.gradStop2} onChange={(v) => setGrad({ gradStop2: v })} fmt={(v) => `${Math.round(v)}%`} />
            <Slider label="Bottom fade" min={0} max={100} value={grad.gradBottom} onChange={(v) => setGrad({ gradBottom: v })} fmt={(v) => `${Math.round(v)}%`} />
            <Slider label="Opacity" min={0} max={1} step={0.02} value={grad.gradOpacity} onChange={(v) => setGrad({ gradOpacity: v })} {...pct} />
            <Slider label="Band height" min={10} max={80} value={grad.gradBandPct} onChange={(v) => setGrad({ gradBandPct: v })} fmt={(v) => `${Math.round(v)}%`} />
            {params.gradients?.[sizeKey] && (
              <button
                onClick={() => setParams((p) => {
                  if (!p?.gradients) return p
                  const next = { ...p.gradients }
                  delete next[p.sizeKey]
                  return { ...p, gradients: next }
                })}
                className="text-[11px] text-zinc-400 underline hover:text-zinc-200"
              >
                Reset to global gradient
              </button>
            )}
          </Section>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold text-zinc-300">Provider label</p>
              <div className="flex gap-1.5">
                <button
                  onClick={() => setLabelEdit((e) => !e)}
                  className="rounded-md border border-zinc-700 px-2 py-0.5 text-[11px] text-zinc-300 transition hover:bg-zinc-800"
                >
                  {labelEdit ? 'Lock' : 'Edit'}
                </button>
                <button
                  onClick={async () => {
                    await saveEdited()
                    setLabelEdit(false)
                  }}
                  disabled={saving || !dirty}
                  className="rounded-md bg-accent px-2 py-0.5 text-[11px] font-medium text-zinc-900 transition hover:bg-accent-dark disabled:opacity-40"
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
            <div className={labelEdit ? 'space-y-2' : 'pointer-events-none space-y-2 opacity-50'}>
            <Row label="Show">
              <input
                type="checkbox"
                checked={params.showProvider}
                onChange={(e) => setP({ showProvider: e.target.checked })}
                className="h-4 w-4 accent-accent"
              />
            </Row>
            <Row label="Position">
              <select
                value={params.providerPos}
                onChange={(e) => setP({ providerPos: e.target.value as ProviderPos })}
                className="rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs outline-none focus:border-zinc-500"
              >
                {PROVIDER_POSITIONS.map((pos) => (
                  <option key={pos} value={pos}>
                    {pos}
                  </option>
                ))}
              </select>
            </Row>
            <Row label="Text case">
              <select
                value={params.providerCase ?? 'as-is'}
                onChange={(e) => setP({ providerCase: e.target.value as TemplateParams['providerCase'] })}
                className="rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs outline-none focus:border-zinc-500"
              >
                {PROVIDER_CASES.map((c) => (
                  <option key={c} value={c}>
                    {c === 'as-is' ? 'As is' : c === 'title' ? 'Title Case' : c === 'upper' ? 'UPPERCASE' : 'lowercase'}
                  </option>
                ))}
              </select>
            </Row>
            <Slider label="Size" min={0.5} max={2.5} step={0.05} value={params.providerScale} onChange={(v) => setP({ providerScale: v })} {...pct} />
            <div className="grid grid-cols-2 gap-2">
              <Slider label="Margin X" min={0} max={60} value={params.providerMarginX} onChange={(v) => setP({ providerMarginX: v })} fmt={(v) => `${Math.round(v)}`} />
              <Slider label="Margin Y" min={0} max={60} value={params.providerMarginY} onChange={(v) => setP({ providerMarginY: v })} fmt={(v) => `${Math.round(v)}`} />
              <Slider label="Pad X" min={0} max={40} value={params.providerPadX} onChange={(v) => setP({ providerPadX: v })} fmt={(v) => `${Math.round(v)}`} />
              <Slider label="Pad top" min={0} max={40} value={params.providerPadY} onChange={(v) => setP({ providerPadY: v })} fmt={(v) => `${Math.round(v)}`} />
              <Slider label="Pad bottom" min={0} max={40} value={params.providerPadBottom ?? 0} onChange={(v) => setP({ providerPadBottom: v })} fmt={(v) => `${Math.round(v)}`} />
              <div />
              <Slider label="R ◜" min={0} max={40} value={params.providerRadius.tl} onChange={(v) => setP({ providerRadius: { ...params.providerRadius, tl: v } })} fmt={(v) => `${Math.round(v)}`} />
              <Slider label="R ◝" min={0} max={40} value={params.providerRadius.tr} onChange={(v) => setP({ providerRadius: { ...params.providerRadius, tr: v } })} fmt={(v) => `${Math.round(v)}`} />
              <Slider label="R ◟" min={0} max={40} value={params.providerRadius.bl} onChange={(v) => setP({ providerRadius: { ...params.providerRadius, bl: v } })} fmt={(v) => `${Math.round(v)}`} />
              <Slider label="R ◞" min={0} max={40} value={params.providerRadius.br} onChange={(v) => setP({ providerRadius: { ...params.providerRadius, br: v } })} fmt={(v) => `${Math.round(v)}`} />
            </div>
            <p className="text-[11px] text-zinc-500">
              {labelEdit ? 'The badge text is each game’s provider. Styling applies to every thumbnail.' : 'Locked — tap Edit to change the provider label.'}
            </p>
            </div>
          </div>

          <p className="text-[11px] text-zinc-500">
            Layout &amp; gradient are saved per aspect size — a dot marks an edited size, and only edited sizes are written on save. ⌘Z undoes, ⌘⇧Z redoes.
          </p>
        </aside>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-[11px] font-semibold text-zinc-300">{title}</p>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-zinc-400">{label}</span>
      {children}
    </div>
  )
}

