import { useEffect, useMemo, useRef, useState } from 'react'
import { useTemplate } from '../hooks/useTemplate'
import { useThumbnailsData } from '../hooks/useThumbnailsData'
import { useFigmaAssets } from '../hooks/useFigmaAssets'
import {
  FRAME_SIZES,
  FRAME_DESIGN_KEYS,
  ANIM_PRESETS,
  ALIGN9,
  branchParams,
  defaultLayout,
  effectiveParams,
  frameSize,
  resolveGrad,
  withDefaults,
  type Align9,
  type GradientParams,
  type ParamOverride,
  type SizeLayout,
  type TemplateParams,
} from '../lib/thumb'
import { PALETTES, type PaletteMode } from '../lib/palettes'
import { FONT_OPTIONS, WEIGHT_OPTIONS, ensureFont } from '../lib/fonts'
import type { Branch } from '../lib/types'
import type { Role } from '../hooks/useProfile'
import { ThumbnailCard } from './Thumbnail'
import { exportThumbPng, exportThumbAnim, animSupported, type StillFormat } from '../lib/exportThumb'
import { ExportProgress, type ExportJob } from './ExportProgress'
import { GenerativeMotion } from './GenerativeMotion'
import { WhiteLogo } from './WhiteLogo'

type ExportFormat = StillFormat | 'anim'

type Scope = 'global' | 'selected'

interface Props {
  role: Role
  branch: Branch | null
  saveFrameParams: (id: string, frame_params: Record<string, unknown>) => Promise<void>
}

export function ThumbnailStudio({ role, branch, saveFrameParams }: Props) {
  const { template, loading: tLoading, save } = useTemplate()
  const { thumbnails, loading: thLoading, saveOverrides, saveAnim, saveLogoWhite } = useThumbnailsData()
  const { assetsFor } = useFigmaAssets(thumbnails)

  const [params, setParams] = useState<TemplateParams | null>(null)
  const [overrides, setOverrides] = useState<Record<string, ParamOverride>>({})
  const [frameParams, setFrameParams] = useState<ParamOverride>({})
  const [scope, setScope] = useState<Scope>('global')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [format, setFormat] = useState<ExportFormat>('png')
  const [playing, setPlaying] = useState(false)
  const [phase, setPhase] = useState(0)
  const [exportJobs, setExportJobs] = useState<ExportJob[]>([])
  const [exportOpen, setExportOpen] = useState(false)
  const [showFrame, setShowFrame] = useState(true)
  const cancelRef = useRef(false)

  const isDesigner = role === 'designer'
  const editingBranch = !!branch && !branch.is_default // a client branch = frame-design mode

  useEffect(() => {
    if (template && !params) setParams(withDefaults(template.params))
  }, [template, params])
  useEffect(() => {
    setOverrides((cur) =>
      Object.keys(cur).length ? cur : Object.fromEntries(thumbnails.map((t) => [t.id, t.overrides ?? {}])),
    )
    if (!selectedId && thumbnails.length) setSelectedId(thumbnails[0].id)
  }, [thumbnails, selectedId])
  // Reset the frame-design draft whenever the active branch changes.
  useEffect(() => {
    setFrameParams((branch?.frame_params as ParamOverride) ?? {})
  }, [branch?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const selected = thumbnails.find((t) => t.id === selectedId) ?? null
  const selOv = selectedId ? overrides[selectedId] ?? {} : {}

  // The composited params used to render a given thumbnail (list, preview, export).
  // The active branch's frame design (frame_params) is layered on for every branch;
  // while editing a client branch we use the live draft so changes preview instantly.
  const activeFrameParams = editingBranch ? frameParams : ((branch?.frame_params as ParamOverride) ?? {})
  const paramsForThumb = useMemo(() => {
    return (t: (typeof thumbnails)[number]): TemplateParams | null => {
      if (!params) return null
      return branchParams(effectiveParams(params, overrides[t.id]), activeFrameParams)
    }
  }, [params, overrides, activeFrameParams])

  // Values shown in the control panel (reflect what's being edited).
  const activeParams = params
    ? editingBranch
      ? branchParams(params, frameParams)
      : scope === 'global'
        ? params
        : effectiveParams(params, selOv)
    : null

  // keep the selected text-logo font warm in the preview
  useEffect(() => {
    if (activeParams?.textLogo) ensureFont(activeParams.fontFamily)
  }, [activeParams?.textLogo, activeParams?.fontFamily])

  // animation preview: drive a 0..1 loop phase while playing
  useEffect(() => {
    if (!playing || !activeParams?.animEnabled) {
      setPhase(0)
      return
    }
    const dur = Math.max(0.5, activeParams.animSpeed) * 1000
    let raf = 0
    const t0 = performance.now()
    const loop = () => {
      setPhase(((performance.now() - t0) % dur) / dur)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [playing, activeParams?.animEnabled, activeParams?.animSpeed])

  const globalDirty = useMemo(
    () => (template && params ? JSON.stringify(params) !== JSON.stringify(template.params) : false),
    [params, template],
  )
  const selDirty = useMemo(
    () => (selected ? JSON.stringify(selOv) !== JSON.stringify(selected.overrides ?? {}) : false),
    [selOv, selected],
  )
  const branchDirty = useMemo(
    () => (editingBranch ? JSON.stringify(frameParams) !== JSON.stringify(branch?.frame_params ?? {}) : false),
    [editingBranch, frameParams, branch],
  )
  const dirty = editingBranch ? branchDirty : scope === 'global' ? globalDirty : selDirty

  if (tLoading || thLoading || !params || !activeParams) {
    return <div className="py-20 text-center text-zinc-500">Loading studio…</div>
  }

  // Section visibility by role + mode.
  const showDesignerSections = !editingBranch && isDesigner // brand-defining controls
  const showFrameSections = editingBranch || isDesigner // frame design (client branch, or designer on main)
  const showScope = isDesigner && !editingBranch
  const lockedForClient = !isDesigner && !editingBranch // client viewing the main template

  function set<K extends keyof TemplateParams>(key: K, value: TemplateParams[K]) {
    // Aspect is the size you're viewing/designing — always template-level, never
    // a per-thumbnail override (that would resize a single game).
    if (key === 'sizeKey') {
      setParams((prev) => (prev ? { ...prev, sizeKey: value as string } : prev))
      return
    }
    if (editingBranch) {
      if (!FRAME_DESIGN_KEYS.includes(key)) return
      setFrameParams((fp) => ({ ...fp, [key]: value }))
    } else if (scope === 'global') setParams((prev) => (prev ? { ...prev, [key]: value } : prev))
    else if (selectedId) setOverrides((o) => ({ ...o, [selectedId]: { ...(o[selectedId] ?? {}), [key]: value } }))
  }
  // Per-size alignment layout. Global scope edits the template; selected scope
  // stores a per-thumbnail layout override (merged over the template by size).
  function setLayout(patch: Partial<SizeLayout>) {
    if (!params) return
    const key = params.sizeKey
    if (scope === 'global') {
      setParams((prev) => {
        if (!prev) return prev
        const cur = prev.layouts?.[key] ?? defaultLayout(key)
        return { ...prev, layouts: { ...(prev.layouts ?? {}), [key]: { ...cur, ...patch } } }
      })
    } else if (selectedId) {
      setOverrides((o) => {
        const curOv = o[selectedId] ?? {}
        const cur = curOv.layouts?.[key] ?? params.layouts?.[key] ?? defaultLayout(key)
        return { ...o, [selectedId]: { ...curOv, layouts: { ...(curOv.layouts ?? {}), [key]: { ...cur, ...patch } } } }
      })
    }
  }
  // Drop the layout for the current size (revert to template / auto).
  function resetLayout() {
    if (!params) return
    const key = params.sizeKey
    if (scope === 'global') {
      setParams((prev) => {
        if (!prev?.layouts) return prev
        const next = { ...prev.layouts }
        delete next[key]
        return { ...prev, layouts: next }
      })
    } else if (selectedId) {
      setOverrides((o) => {
        const curOv = o[selectedId]
        if (!curOv?.layouts) return o
        const next = { ...curOv.layouts }
        delete next[key]
        return { ...o, [selectedId]: { ...curOv, layouts: next } }
      })
    }
  }
  // Gradient edits: if the effective gradient for this size comes from a per-size
  // override, keep editing there (so the slider stays live); otherwise edit the
  // flat globals. Prevents the "dead slider" once a per-size gradient exists.
  function setGrad<K extends keyof GradientParams>(key: K, value: number) {
    if (!params) return
    const size = params.sizeKey
    if (editingBranch) {
      setFrameParams((fp) => {
        const per = (fp.gradients as TemplateParams['gradients'])?.[size]
        if (per) return { ...fp, gradients: { ...(fp.gradients ?? {}), [size]: { ...per, [key]: value } } }
        return { ...fp, [key]: value }
      })
    } else if (scope === 'global') {
      setParams((prev) => {
        if (!prev) return prev
        if (prev.gradients?.[size]) return { ...prev, gradients: { ...prev.gradients, [size]: { ...prev.gradients[size], [key]: value } } }
        return { ...prev, [key]: value }
      })
    } else if (selectedId) {
      setOverrides((o) => {
        const cur = o[selectedId] ?? {}
        const basePer = params.gradients?.[size]
        const ovPer = cur.gradients?.[size]
        if (ovPer || basePer) {
          const merged: GradientParams = { ...resolveGrad(params), ...(ovPer ?? {}), [key]: value }
          return { ...o, [selectedId]: { ...cur, gradients: { ...(cur.gradients ?? {}), [size]: merged } } }
        }
        return { ...o, [selectedId]: { ...cur, [key]: value } }
      })
    }
  }
  function setLogo(patch: Partial<TemplateParams['logo']>) {
    if (editingBranch) return // logo geometry is designer-only
    if (scope === 'global') setParams((prev) => (prev ? { ...prev, logo: { ...prev.logo, ...patch } } : prev))
    else if (selectedId)
      setOverrides((o) => {
        const cur = o[selectedId] ?? {}
        return { ...o, [selectedId]: { ...cur, logo: { ...(cur.logo ?? {}), ...patch } } }
      })
  }

  async function handleSave() {
    if (!params) return
    setSaving(true)
    try {
      if (editingBranch && branch) await saveFrameParams(branch.id, frameParams)
      else if (scope === 'global') await save(params)
      else if (selectedId) await saveOverrides(selectedId, selOv)
    } finally {
      setSaving(false)
    }
  }
  function handleReset() {
    if (editingBranch) setFrameParams((branch?.frame_params as ParamOverride) ?? {})
    else if (scope === 'global') template && setParams(withDefaults(template.params))
    else if (selectedId) setOverrides((o) => ({ ...o, [selectedId]: {} }))
  }
  async function exportOne(t: (typeof thumbnails)[number], pp: TemplateParams): Promise<number> {
    if (format === 'anim') return exportThumbAnim(t, pp)
    return exportThumbPng(t, pp, 1, format)
  }
  async function runExport(list: (typeof thumbnails)) {
    if (!list.length || exporting) return
    cancelRef.current = false
    const fmtLabel = format === 'anim' ? 'WEBM' : format.toUpperCase()
    setExportJobs(list.map((t) => ({ id: t.id, name: t.name, format: fmtLabel, status: 'pending' })))
    setExportOpen(true)
    setExporting(true)
    try {
      for (const t of list) {
        if (cancelRef.current) {
          setExportJobs((js) => js.map((j) => (j.status === 'pending' ? { ...j, status: 'error', error: 'Cancelled' } : j)))
          break
        }
        setExportJobs((js) => js.map((j) => (j.id === t.id ? { ...j, status: 'active' } : j)))
        try {
          const pp = paramsForThumb(t)
          const size = pp ? await exportOne(t, pp) : 0
          setExportJobs((js) => js.map((j) => (j.id === t.id ? { ...j, status: 'done', size } : j)))
        } catch (e) {
          setExportJobs((js) => js.map((j) => (j.id === t.id ? { ...j, status: 'error', error: (e as Error).message } : j)))
        }
        await new Promise((r) => setTimeout(r, 120))
      }
    } finally {
      setExporting(false)
    }
  }
  const exportAll = () => runExport(thumbnails)

  // Quick per-thumbnail recolour (designer): set + persist the colour override.
  function recolorThumb(id: string, palette: PaletteMode, colorKey: string) {
    setOverrides((o) => {
      const next = { ...(o[id] ?? {}), palette, colorKey }
      saveOverrides(id, next)
      return { ...o, [id]: next }
    })
  }

  const p = activeParams
  // When a per-size layout is active it drives KV/logo placement; the legacy fine
  // sliders (KV Size/Lift, Logo X/Y/W/H) are then inert, so hide them and let the
  // Layout section own placement (click "Auto" there to fall back to the sliders).
  const layoutActive = !!p.layouts?.[p.sizeKey]
  const size = frameSize(p.sizeKey)
  const previewW = Math.min(520, Math.round(size.w * (460 / size.h)))
  const gridW = Math.min(260, Math.round(size.w * (260 / size.h)))
  const selectedParams = selected ? paramsForThumb(selected) : null
  // Single canvas only when a specific thumbnail is targeted; otherwise a grid.
  const singleView = !editingBranch && scope === 'selected' && !!selected
  const previewPhase = playing ? phase : 0
  const canExportAnim = animSupported()

  return (
    <div className="flex h-[calc(100vh-7.5rem)] gap-3">
      {/* LEFT — thumbnails */}
      <aside className="flex w-[236px] shrink-0 flex-col overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/50">
        <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-2.5">
          <span className="text-sm font-medium">Thumbnails</span>
          <span className="text-xs text-zinc-500">{thumbnails.length}</span>
        </div>
        <div className="flex-1 space-y-1 overflow-y-auto p-2">
          {thumbnails.map((t) => {
            const hasOv = Object.keys(overrides[t.id] ?? {}).length > 0
            const pp = paramsForThumb(t)
            return (
              <button
                key={t.id}
                onClick={() => setSelectedId(t.id)}
                className={`flex w-full items-center gap-2.5 rounded-lg p-1.5 text-left transition ${
                  t.id === selectedId ? 'bg-zinc-800 ring-1 ring-zinc-700' : 'hover:bg-zinc-800/50'
                }`}
              >
                <div className="overflow-hidden rounded">
                  {pp && <ThumbnailCard thumb={t} params={pp} assets={assetsFor(t)} displayW={52} showFrame={showFrame} />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-zinc-200">{t.name}</p>
                  <p className="text-[10px] text-zinc-500">{hasOv ? 'custom' : t.provider}</p>
                </div>
              </button>
            )
          })}
        </div>
        <div className="border-t border-zinc-800 p-2">
          <button
            onClick={exportAll}
            disabled={exporting}
            className="w-full rounded-lg bg-zinc-800 py-2 text-xs font-medium text-zinc-200 hover:bg-zinc-700 disabled:opacity-60"
          >
            {exporting ? 'Exporting…' : 'Export all'}
          </button>
        </div>
      </aside>

      {/* CENTER — canvas / grid */}
      <div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950/40">
        <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-2.5">
          <span className="text-sm font-medium">{singleView ? selected?.name : `All thumbnails · ${thumbnails.length}`}</span>
          <div className="flex items-center gap-2">
            <span className="hidden text-xs text-zinc-500 sm:inline">{size.label}</span>
            <button
              onClick={() => setShowFrame((v) => !v)}
              className={`rounded-lg border px-3 py-1.5 text-xs transition ${
                showFrame ? 'border-zinc-700 text-zinc-200 hover:bg-zinc-800' : 'border-zinc-800 bg-zinc-800/40 text-zinc-500'
              }`}
              title="Show or hide the frame stroke + provider badge in previews"
            >
              {showFrame ? '▣ Frames' : '▢ Frames'}
            </button>
            {p.animEnabled && (
              <button
                onClick={() => setPlaying((v) => !v)}
                className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-800"
              >
                {playing ? '❚❚ Pause' : '▶ Play'}
              </button>
            )}
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value as ExportFormat)}
              className="rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-xs outline-none focus:border-zinc-500"
              title="Export format"
            >
              <option value="png">PNG</option>
              <option value="webp">WebP</option>
              <option value="avif">AVIF</option>
              <option value="anim" disabled={!canExportAnim}>
                Animated (WebM)
              </option>
            </select>
            {singleView && selected && selectedParams && (
              <button
                onClick={() => runExport([selected])}
                disabled={exporting}
                className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
              >
                Export
              </button>
            )}
          </div>
        </div>
        {singleView && selected && selectedParams ? (
          <div
            className="flex flex-1 items-center justify-center overflow-auto p-8"
            style={{
              backgroundImage: 'radial-gradient(circle at center, #1a1c22 1px, transparent 1px)',
              backgroundSize: '22px 22px',
            }}
          >
            <div className="shadow-2xl">
              <ThumbnailCard thumb={selected} params={selectedParams} assets={assetsFor(selected)} displayW={previewW} phase={previewPhase} showFrame={showFrame} />
            </div>
          </div>
        ) : (
          <div
            className="flex-1 overflow-auto p-6"
            style={{
              backgroundImage: 'radial-gradient(circle at center, #1a1c22 1px, transparent 1px)',
              backgroundSize: '22px 22px',
            }}
          >
            <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${gridW}px, 1fr))` }}>
              {thumbnails.map((t) => {
                const pp = paramsForThumb(t)
                if (!pp) return null
                const active = t.id === selectedId
                return (
                  <div
                    key={t.id}
                    onClick={() => {
                      setSelectedId(t.id)
                      if (showScope) setScope('selected')
                    }}
                    className={`group relative flex cursor-pointer flex-col items-center gap-2 rounded-xl p-2 transition ${
                      active ? 'bg-zinc-800/60 ring-1 ring-zinc-600' : 'hover:bg-zinc-800/30'
                    }`}
                    title={showScope ? 'Open in canvas' : t.name}
                  >
                    <div className="w-full overflow-hidden rounded-lg shadow-lg">
                      <ThumbnailCard thumb={t} params={pp} assets={assetsFor(t)} displayW={gridW} phase={previewPhase} showFrame={showFrame} />
                    </div>
                    {isDesigner && (
                      <div className="absolute right-3 top-3 opacity-0 transition group-hover:opacity-100">
                        <ThumbColorPicker
                          palette={pp.palette}
                          colorKey={pp.colorKey}
                          onPick={(mode, key) => recolorThumb(t.id, mode, key)}
                        />
                      </div>
                    )}
                    <span className="max-w-full truncate text-[11px] text-zinc-400">{t.name}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* RIGHT — controls */}
      <aside className="flex w-[300px] shrink-0 flex-col overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/50">
        <div className="border-b border-zinc-800 p-3">
          {editingBranch ? (
            <>
              <div className="rounded-lg bg-zinc-800/70 px-3 py-2 text-xs">
                <span className="font-medium text-zinc-100">Frame design</span>
                <span className="text-zinc-500"> · {branch?.name}</span>
              </div>
              <p className="mt-2 text-[11px] text-zinc-500">
                Customising this client branch. Background, logo size and game colours are inherited from the main template.
              </p>
            </>
          ) : showScope ? (
            <>
              <Seg
                options={[
                  { value: 'global', label: 'All thumbnails' },
                  { value: 'selected', label: 'This one', disabled: !selected },
                ]}
                value={scope}
                onChange={(v) => setScope(v as Scope)}
              />
              <p className="mt-2 text-[11px] text-zinc-500">
                {scope === 'global' ? 'Editing the main template — applies to all.' : `Overriding “${selected?.name}” only.`}
              </p>
            </>
          ) : (
            <p className="text-[11px] text-zinc-500">Main template (read-only). Select your branch above to customise the frame design.</p>
          )}
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-3">
          {lockedForClient && (
            <div className="rounded-lg border border-zinc-800 bg-zinc-800/30 p-3 text-xs text-zinc-400">
              You have client access. Pick your branch from the top bar to change the frame design and choose colour or white logotypes.
            </div>
          )}

          {showFrameSections && (
            <Section title="Frame">
              <Row label="Aspect">
                <select
                  value={p.sizeKey}
                  onChange={(e) => set('sizeKey', e.target.value)}
                  className="rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs outline-none focus:border-zinc-500"
                >
                  {FRAME_SIZES.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.key}
                    </option>
                  ))}
                </select>
              </Row>
              <Seg options={['sharp', 'friendly', 'playful'].map((o) => ({ value: o, label: o }))} value={p.cornerMode} onChange={(v) => set('cornerMode', v as TemplateParams['cornerMode'])} />
            </Section>
          )}

          {showDesignerSections && (
            <Section title="Colour">
              <Seg options={['dark', 'light'].map((o) => ({ value: o, label: o }))} value={p.palette} onChange={(v) => set('palette', v as PaletteMode)} />
              <div className="flex flex-wrap gap-1.5 pt-1">
                {PALETTES[p.palette].map((c) => (
                  <button
                    key={c.key}
                    title={c.label}
                    onClick={() => set('colorKey', c.key)}
                    className={`h-6 w-6 rounded-full ring-2 ${p.colorKey === c.key ? 'ring-white' : 'ring-transparent'}`}
                    style={{ background: c.stroke }}
                  />
                ))}
              </div>
            </Section>
          )}

          {showDesignerSections && (
            <Section title="Background">
              <Slider label="Zoom" min={1} max={3} step={0.01} value={p.bgScale} onChange={(v) => set('bgScale', v)} fmt={(v) => `${v.toFixed(2)}×`} />
              <p className="text-[11px] text-zinc-500">Centered · fills the frame.</p>
            </Section>
          )}

          {showFrameSections && (() => {
            const g = resolveGrad(p)
            return (
              <Section title="Light gradient">
                <Slider label="Top fade" min={0} max={100} value={g.gradStop1} onChange={(v) => setGrad('gradStop1', v)} fmt={(v) => `${Math.round(v)}%`} />
                <Slider label="Colour stop" min={0} max={100} value={g.gradStop2} onChange={(v) => setGrad('gradStop2', v)} fmt={(v) => `${Math.round(v)}%`} />
                <Slider label="Bottom fade" min={0} max={100} value={g.gradBottom} onChange={(v) => setGrad('gradBottom', v)} fmt={(v) => `${Math.round(v)}%`} />
                <Slider label="Opacity" min={0} max={1} step={0.02} value={g.gradOpacity} onChange={(v) => setGrad('gradOpacity', v)} fmt={(v) => `${Math.round(v * 100)}%`} />
                <Slider label="Band height" min={10} max={80} value={g.gradBandPct} onChange={(v) => setGrad('gradBandPct', v)} fmt={(v) => `${Math.round(v)}%`} />
              </Section>
            )
          })()}

          {showDesignerSections && !layoutActive && (
            <Section title="Key visual">
              <Slider label="Size" min={20} max={120} value={p.kvSizePct} onChange={(v) => set('kvSizePct', v)} fmt={(v) => `${Math.round(v)}%`} />
              <Slider label="Lift" min={-15} max={45} value={p.kvBottomPct} onChange={(v) => set('kvBottomPct', v)} fmt={(v) => `${Math.round(v)}%`} />
            </Section>
          )}

          {showDesignerSections && (() => {
            const lay = p.layouts?.[p.sizeKey] ?? defaultLayout(p.sizeKey)
            const hasLayout = scope === 'global' ? !!params.layouts?.[p.sizeKey] : !!selOv.layouts?.[p.sizeKey]
            return (
              <Section title={`Layout · ${p.sizeKey}`}>
                <Row label="Key visual">
                  <AlignGrid value={lay.kvAlign} onChange={(a) => setLayout({ kvAlign: a })} />
                </Row>
                <Slider label="KV size" min={0.3} max={2} step={0.02} value={lay.kvScale} onChange={(v) => setLayout({ kvScale: v })} fmt={(v) => `${Math.round(v * 100)}%`} />
                <Row label="Logo">
                  <AlignGrid value={lay.logoAlign} onChange={(a) => setLayout({ logoAlign: a })} />
                </Row>
                <Slider label="Logo size" min={0.1} max={0.7} step={0.02} value={lay.logoScale} onChange={(v) => setLayout({ logoScale: v })} fmt={(v) => `${Math.round(v * 100)}%`} />
                <div className="flex items-center justify-between">
                  <p className="text-[11px] text-zinc-500">
                    {scope === 'global' ? 'Saved per size · applies to all thumbnails.' : `Placement for “${selected?.name}” · this size.`}
                  </p>
                  {hasLayout && (
                    <button onClick={resetLayout} className="text-[11px] text-zinc-400 underline hover:text-zinc-200">
                      Auto
                    </button>
                  )}
                </div>
              </Section>
            )
          })()}

          {showFrameSections && (
            <Section title="Logo style">
              <Seg options={['color', 'white'].map((o) => ({ value: o, label: o }))} value={p.logoVariant} onChange={(v) => set('logoVariant', v as TemplateParams['logoVariant'])} />
              <Row label="Text logo">
                <input type="checkbox" checked={p.textLogo} onChange={(e) => set('textLogo', e.target.checked)} />
              </Row>
              {p.textLogo && (
                <>
                  <Row label="Font">
                    <select
                      value={p.fontFamily}
                      onChange={(e) => set('fontFamily', e.target.value)}
                      className="rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs outline-none focus:border-zinc-500"
                    >
                      {FONT_OPTIONS.map((f) => (
                        <option key={f} value={f}>
                          {f}
                        </option>
                      ))}
                    </select>
                  </Row>
                  <Row label="Weight">
                    <select
                      value={p.textWeight}
                      onChange={(e) => set('textWeight', Number(e.target.value))}
                      className="rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs outline-none focus:border-zinc-500"
                    >
                      {WEIGHT_OPTIONS.map((w) => (
                        <option key={w} value={w}>
                          {w}
                        </option>
                      ))}
                    </select>
                  </Row>
                  <Row label="Align">
                    <div className="w-40">
                      <Seg
                        options={['left', 'center', 'right'].map((o) => ({ value: o, label: o }))}
                        value={p.textAlign}
                        onChange={(v) => set('textAlign', v as TemplateParams['textAlign'])}
                      />
                    </div>
                  </Row>
                  <Row label="Colour">
                    <div className="flex items-center gap-2">
                      <div className="w-28">
                        <Seg
                          options={[
                            { value: 'game', label: 'game' },
                            { value: 'white', label: 'white' },
                            { value: 'custom', label: '◆' },
                          ]}
                          value={p.textColorMode}
                          onChange={(v) => set('textColorMode', v as TemplateParams['textColorMode'])}
                        />
                      </div>
                      {p.textColorMode === 'custom' && (
                        <input
                          type="color"
                          value={p.textColor}
                          onChange={(e) => set('textColor', e.target.value)}
                          className="h-6 w-8 cursor-pointer rounded border border-zinc-700 bg-transparent"
                        />
                      )}
                    </div>
                  </Row>
                  <Slider label="Size" min={0.6} max={1.4} step={0.02} value={p.textScale} onChange={(v) => set('textScale', v)} fmt={(v) => `${Math.round(v * 100)}%`} />
                  <Slider label="Max lines" min={1} max={4} value={p.textMaxLines} onChange={(v) => set('textMaxLines', v)} fmt={intFmt} />
                  <Slider label="Line gap" min={0.8} max={1.6} step={0.02} value={p.textLineHeight} onChange={(v) => set('textLineHeight', v)} fmt={(v) => v.toFixed(2)} />
                  <Slider label="Letter" min={-5} max={30} value={p.textLetterPct} onChange={(v) => set('textLetterPct', v)} fmt={(v) => `${Math.round(v)}%`} />
                  <Row label="Capital letters">
                    <input type="checkbox" checked={p.textAllCaps} onChange={(e) => set('textAllCaps', e.target.checked)} />
                  </Row>
                  <Row label="Shadow">
                    <input type="checkbox" checked={p.textShadow} onChange={(e) => set('textShadow', e.target.checked)} />
                  </Row>
                  <Row label="Vary line widths">
                    <input type="checkbox" checked={p.textFillLines} onChange={(e) => set('textFillLines', e.target.checked)} />
                  </Row>
                </>
              )}
            </Section>
          )}

          {showDesignerSections && !layoutActive && (
            <Section title="Logo placement">
              <Slider label="X" min={-0.1} max={1} step={0.005} value={p.logo.xPct} onChange={(v) => setLogo({ xPct: v })} fmt={pctFmt} />
              <Slider label="Y" min={0} max={1} step={0.005} value={p.logo.yPct} onChange={(v) => setLogo({ yPct: v })} fmt={pctFmt} />
              <Slider label="Width" min={0.1} max={1} step={0.005} value={p.logo.wPct} onChange={(v) => setLogo({ wPct: v })} fmt={pctFmt} />
              <Slider label="Height" min={0.05} max={0.6} step={0.005} value={p.logo.hPct} onChange={(v) => setLogo({ hPct: v })} fmt={pctFmt} />
            </Section>
          )}

          {showFrameSections && (
            <Section title="Animation">
              <Row label="Enable">
                <input
                  type="checkbox"
                  checked={p.animEnabled}
                  onChange={(e) => {
                    set('animEnabled', e.target.checked)
                    setPlaying(e.target.checked)
                  }}
                />
              </Row>
              {p.animEnabled && (
                <>
                  <Seg
                    options={ANIM_PRESETS.map((o) => ({ value: o, label: o }))}
                    value={p.animPreset}
                    onChange={(v) => set('animPreset', v as TemplateParams['animPreset'])}
                  />
                  <Slider label="Speed" min={0.5} max={8} step={0.1} value={p.animSpeed} onChange={(v) => set('animSpeed', v)} fmt={(v) => `${v.toFixed(1)}s`} />
                  <Slider label="Intensity" min={0} max={1} step={0.05} value={p.animIntensity} onChange={(v) => set('animIntensity', v)} fmt={pctFmt} />
                  <button
                    onClick={() => setPlaying((v) => !v)}
                    className="w-full rounded-lg bg-zinc-800 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-700"
                  >
                    {playing ? '❚❚ Pause preview' : '▶ Play preview'}
                  </button>
                  <p className="text-[11px] text-zinc-500">Export with the “Animated (WebM)” format to save the motion.</p>
                </>
              )}
            </Section>
          )}

          {isDesigner && selected && <WhiteLogo thumb={selected} saveLogoWhite={saveLogoWhite} />}
          {isDesigner && selected && <GenerativeMotion thumb={selected} saveAnim={saveAnim} />}

          {showFrameSections && (
            <Section title="Provider label">
              <Row label="Show">
                <input type="checkbox" checked={p.showProvider} onChange={(e) => set('showProvider', e.target.checked)} />
              </Row>
              <Seg options={['bottom', 'top'].map((o) => ({ value: o, label: o }))} value={p.providerPos} onChange={(v) => set('providerPos', v as TemplateParams['providerPos'])} />
              <div className="grid grid-cols-2 gap-2">
                <Slider label="Pad X" min={0} max={40} value={p.providerPadX} onChange={(v) => set('providerPadX', v)} fmt={intFmt} />
                <Slider label="Pad Y" min={0} max={40} value={p.providerPadY} onChange={(v) => set('providerPadY', v)} fmt={intFmt} />
                <Slider label="R ◜" min={0} max={40} value={p.providerRadius.tl} onChange={(v) => set('providerRadius', { ...p.providerRadius, tl: v })} fmt={intFmt} />
                <Slider label="R ◝" min={0} max={40} value={p.providerRadius.tr} onChange={(v) => set('providerRadius', { ...p.providerRadius, tr: v })} fmt={intFmt} />
                <Slider label="R ◟" min={0} max={40} value={p.providerRadius.bl} onChange={(v) => set('providerRadius', { ...p.providerRadius, bl: v })} fmt={intFmt} />
                <Slider label="R ◞" min={0} max={40} value={p.providerRadius.br} onChange={(v) => set('providerRadius', { ...p.providerRadius, br: v })} fmt={intFmt} />
              </div>
            </Section>
          )}
        </div>

        {!lockedForClient && (
          <div className="flex gap-2 border-t border-zinc-800 p-3">
            <button
              onClick={handleSave}
              disabled={saving || !dirty}
              className="flex-1 rounded-lg bg-accent py-2 text-sm font-semibold text-white hover:bg-accent-dark disabled:opacity-50"
            >
              {saving ? 'Saving…' : dirty ? 'Save' : 'Saved'}
            </button>
            <button onClick={handleReset} disabled={!dirty} className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-300 disabled:opacity-40">
              {editingBranch || scope === 'global' ? 'Reset' : 'Clear'}
            </button>
          </div>
        )}
      </aside>

      <ExportProgress
        open={exportOpen}
        jobs={exportJobs}
        onClose={() => setExportOpen(false)}
        onCancel={() => {
          cancelRef.current = true
        }}
      />
    </div>
  )
}

const pctFmt = (v: number) => `${Math.round(v * 100)}%`
const intFmt = (v: number) => `${Math.round(v)}`

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
    <div className="flex items-center justify-between">
      <span className="text-xs text-zinc-400">{label}</span>
      {children}
    </div>
  )
}

function Seg({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string; disabled?: boolean }[]
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="flex rounded-lg bg-zinc-800/70 p-0.5 text-xs">
      {options.map((o) => (
        <button
          key={o.value}
          disabled={o.disabled}
          onClick={() => onChange(o.value)}
          className={`flex-1 rounded py-1 capitalize transition ${
            value === o.value ? 'bg-zinc-700 font-medium text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'
          } disabled:opacity-40`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function AlignGrid({ value, onChange }: { value: Align9; onChange: (a: Align9) => void }) {
  return (
    <div className="grid grid-cols-3 gap-0.5 rounded-lg border border-zinc-700 bg-zinc-800/50 p-1.5">
      {ALIGN9.map((a) => (
        <button
          key={a}
          onClick={() => onChange(a)}
          className={`grid h-6 w-8 place-items-center rounded transition ${value === a ? 'bg-zinc-700/60' : 'hover:bg-zinc-700/30'}`}
          title={a}
        >
          {value === a ? (
            <span className="flex flex-col items-center gap-[2px]">
              <i className="block h-[2px] w-2.5 rounded-full bg-accent" />
              <i className="block h-[2px] w-3.5 rounded-full bg-accent" />
              <i className="block h-[2px] w-2 rounded-full bg-accent" />
            </span>
          ) : (
            <span className="h-1 w-1 rounded-full bg-zinc-600" />
          )}
        </button>
      ))}
    </div>
  )
}

function Slider({
  label,
  min,
  max,
  step = 1,
  value,
  onChange,
  fmt,
}: {
  label: string
  min: number
  max: number
  step?: number
  value: number
  onChange: (v: number) => void
  fmt: (v: number) => string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState(false)
  const frac = Math.max(0, Math.min(1, (value - min) / (max - min)))
  const valAt = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect()
    const f = Math.max(0, Math.min(1, (clientX - r.left) / r.width))
    return Math.round((min + f * (max - min)) / step) * step
  }
  useEffect(() => {
    if (!drag) return
    const mv = (e: PointerEvent) => onChange(valAt(e.clientX))
    const up = () => setDrag(false)
    window.addEventListener('pointermove', mv)
    window.addEventListener('pointerup', up)
    return () => {
      window.removeEventListener('pointermove', mv)
      window.removeEventListener('pointerup', up)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag])
  return (
    <div
      ref={ref}
      onPointerDown={(e) => {
        setDrag(true)
        onChange(valAt(e.clientX))
      }}
      className="relative flex h-9 cursor-ew-resize select-none items-center justify-between overflow-hidden rounded-lg bg-zinc-800/50 px-3"
    >
      <div className="pointer-events-none absolute inset-y-0 left-0 bg-zinc-700/45" style={{ width: `${frac * 100}%` }} />
      <span className="relative z-10 text-xs text-zinc-300">{label}</span>
      <span className="relative z-10 text-xs tabular-nums text-zinc-100">{fmt(value)}</span>
    </div>
  )
}

function ThumbColorPicker({
  palette,
  colorKey,
  onPick,
}: {
  palette: PaletteMode
  colorKey: string
  onPick: (mode: PaletteMode, key: string) => void
}) {
  const [tab, setTab] = useState<PaletteMode>(palette)
  const current = PALETTES[palette].find((c) => c.key === colorKey)?.stroke ?? '#ffffff'
  return (
    <div className="group/col relative">
      <button
        title="Colour"
        className="grid h-7 w-7 place-items-center rounded-full border-2 border-white/80 shadow-md ring-1 ring-black/30"
        style={{ background: current }}
      >
        <span className="text-[11px] leading-none text-white mix-blend-difference">◑</span>
      </button>
      {/* popover — pt-1.5 acts as an invisible bridge so hover survives the gap */}
      <div className="invisible absolute right-0 top-full z-30 pt-1.5 opacity-0 transition group-hover/col:visible group-hover/col:opacity-100">
        <div className="w-44 rounded-xl border border-zinc-700 bg-[#15161a] p-2 shadow-2xl">
          <div className="mb-2 flex rounded-lg bg-zinc-800 p-0.5 text-[11px]">
            {(['dark', 'light'] as PaletteMode[]).map((m) => (
              <button
                key={m}
                onClick={() => setTab(m)}
                className={`flex-1 rounded-md py-1 capitalize transition ${tab === m ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-400 hover:text-zinc-200'}`}
              >
                {m}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-5 gap-1.5">
            {PALETTES[tab].map((c) => {
              const activeSw = palette === tab && colorKey === c.key
              return (
                <button
                  key={c.key}
                  title={c.label}
                  onClick={() => onPick(tab, c.key)}
                  className={`h-6 w-6 rounded-full ring-2 transition ${activeSw ? 'ring-white' : 'ring-transparent hover:ring-white/50'}`}
                  style={{ background: c.stroke }}
                />
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
