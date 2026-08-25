import { useEffect, useMemo, useRef, useState } from 'react'
import { useTemplate } from '../hooks/useTemplate'
import { useThumbnailsData } from '../hooks/useThumbnailsData'
import { useFigmaAssets } from '../hooks/useFigmaAssets'
import {
  FRAME_SIZES,
  FRAME_DESIGN_KEYS,
  branchParams,
  effectiveParams,
  frameSize,
  withDefaults,
  type ParamOverride,
  type TemplateParams,
} from '../lib/thumb'
import { PALETTES, type PaletteMode } from '../lib/palettes'
import { FONT_OPTIONS, ensureFont } from '../lib/fonts'
import type { Branch } from '../lib/types'
import type { Role } from '../hooks/useProfile'
import { ThumbnailCard } from './Thumbnail'
import { exportThumbPng } from '../lib/exportThumb'

type Scope = 'global' | 'selected'

interface Props {
  role: Role
  branch: Branch | null
  saveFrameParams: (id: string, frame_params: Record<string, unknown>) => Promise<void>
}

export function ThumbnailStudio({ role, branch, saveFrameParams }: Props) {
  const { template, loading: tLoading, save } = useTemplate()
  const { thumbnails, loading: thLoading, saveOverrides } = useThumbnailsData()
  const { assetsFor } = useFigmaAssets(thumbnails)

  const [params, setParams] = useState<TemplateParams | null>(null)
  const [overrides, setOverrides] = useState<Record<string, ParamOverride>>({})
  const [frameParams, setFrameParams] = useState<ParamOverride>({})
  const [scope, setScope] = useState<Scope>('global')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [exporting, setExporting] = useState(false)

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
  const paramsForThumb = useMemo(() => {
    return (t: (typeof thumbnails)[number]): TemplateParams | null => {
      if (!params) return null
      const base = effectiveParams(params, overrides[t.id])
      return editingBranch ? branchParams(base, frameParams) : base
    }
  }, [params, overrides, editingBranch, frameParams])

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
    if (editingBranch) {
      if (!FRAME_DESIGN_KEYS.includes(key)) return
      setFrameParams((fp) => ({ ...fp, [key]: value }))
    } else if (scope === 'global') setParams((prev) => (prev ? { ...prev, [key]: value } : prev))
    else if (selectedId) setOverrides((o) => ({ ...o, [selectedId]: { ...(o[selectedId] ?? {}), [key]: value } }))
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
  async function exportAll() {
    setExporting(true)
    try {
      for (const t of thumbnails) {
        const pp = paramsForThumb(t)
        if (pp) await exportThumbPng(t, pp)
        await new Promise((r) => setTimeout(r, 250))
      }
    } finally {
      setExporting(false)
    }
  }

  const p = activeParams
  const size = frameSize(p.sizeKey)
  const previewW = Math.min(520, Math.round(size.w * (460 / size.h)))
  const selectedParams = selected ? paramsForThumb(selected) : null

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
                  {pp && <ThumbnailCard thumb={t} params={pp} assets={assetsFor(t)} displayW={52} />}
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

      {/* CENTER — canvas */}
      <div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950/40">
        <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-2.5">
          <span className="text-sm font-medium">{selected?.name}</span>
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-500">{size.label}</span>
            {selected && selectedParams && (
              <button
                onClick={() => exportThumbPng(selected, selectedParams)}
                className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-800"
              >
                Export PNG
              </button>
            )}
          </div>
        </div>
        <div
          className="flex flex-1 items-center justify-center overflow-auto p-8"
          style={{
            backgroundImage: 'radial-gradient(circle at center, #1a1c22 1px, transparent 1px)',
            backgroundSize: '22px 22px',
          }}
        >
          {selected && selectedParams && (
            <div className="shadow-2xl">
              <ThumbnailCard thumb={selected} params={selectedParams} assets={assetsFor(selected)} displayW={previewW} />
            </div>
          )}
        </div>
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

          {showFrameSections && (
            <Section title="Light gradient">
              <Slider label="Stop 1" min={0} max={100} value={p.gradStop1} onChange={(v) => set('gradStop1', v)} fmt={(v) => `${Math.round(v)}%`} />
              <Slider label="Stop 2" min={0} max={100} value={p.gradStop2} onChange={(v) => set('gradStop2', v)} fmt={(v) => `${Math.round(v)}%`} />
              <Slider label="Band height" min={10} max={80} value={p.gradBandPct} onChange={(v) => set('gradBandPct', v)} fmt={(v) => `${Math.round(v)}%`} />
            </Section>
          )}

          {showDesignerSections && (
            <Section title="Key visual">
              <Slider label="Size" min={20} max={120} value={p.kvSizePct} onChange={(v) => set('kvSizePct', v)} fmt={(v) => `${Math.round(v)}%`} />
              <Slider label="Lift" min={-15} max={45} value={p.kvBottomPct} onChange={(v) => set('kvBottomPct', v)} fmt={(v) => `${Math.round(v)}%`} />
            </Section>
          )}

          {showFrameSections && (
            <Section title="Logo style">
              <Seg options={['color', 'white'].map((o) => ({ value: o, label: o }))} value={p.logoVariant} onChange={(v) => set('logoVariant', v as TemplateParams['logoVariant'])} />
              <Row label="Text logo">
                <input type="checkbox" checked={p.textLogo} onChange={(e) => set('textLogo', e.target.checked)} />
              </Row>
              {p.textLogo && (
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
              )}
            </Section>
          )}

          {showDesignerSections && (
            <Section title="Logo placement">
              <Slider label="X" min={-0.1} max={1} step={0.005} value={p.logo.xPct} onChange={(v) => setLogo({ xPct: v })} fmt={pctFmt} />
              <Slider label="Y" min={0} max={1} step={0.005} value={p.logo.yPct} onChange={(v) => setLogo({ yPct: v })} fmt={pctFmt} />
              <Slider label="Width" min={0.1} max={1} step={0.005} value={p.logo.wPct} onChange={(v) => setLogo({ wPct: v })} fmt={pctFmt} />
              <Slider label="Height" min={0.05} max={0.6} step={0.005} value={p.logo.hPct} onChange={(v) => setLogo({ hPct: v })} fmt={pctFmt} />
            </Section>
          )}

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
              className="flex-1 rounded-lg bg-brand py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
            >
              {saving ? 'Saving…' : dirty ? 'Save' : 'Saved'}
            </button>
            <button onClick={handleReset} disabled={!dirty} className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-300 disabled:opacity-40">
              {editingBranch || scope === 'global' ? 'Reset' : 'Clear'}
            </button>
          </div>
        )}
      </aside>
    </div>
  )
}

const pctFmt = (v: number) => `${Math.round(v * 100)}%`
const intFmt = (v: number) => `${Math.round(v)}`

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">{title}</p>
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
          className={`flex-1 rounded-md py-1.5 capitalize transition ${
            value === o.value ? 'bg-zinc-100 font-medium text-zinc-900' : 'text-zinc-400 hover:text-zinc-200'
          } disabled:opacity-40`}
        >
          {o.label}
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
