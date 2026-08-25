import { useEffect, useMemo, useState } from 'react'
import { useTemplate } from '../hooks/useTemplate'
import { useThumbnailsData } from '../hooks/useThumbnailsData'
import { useFigmaAssets } from '../hooks/useFigmaAssets'
import { FRAME_SIZES, effectiveParams, withDefaults, type ParamOverride, type TemplateParams } from '../lib/thumb'
import { PALETTES, type PaletteMode } from '../lib/palettes'
import { ThumbnailCard } from './Thumbnail'
import { exportThumbPng } from '../lib/exportThumb'

type Scope = 'global' | 'selected'

export function ThumbnailStudio() {
  const { template, loading: tLoading, save } = useTemplate()
  const { thumbnails, loading: thLoading, saveOverrides } = useThumbnailsData()
  const { assetsFor } = useFigmaAssets(thumbnails)

  const [params, setParams] = useState<TemplateParams | null>(null)
  const [overrides, setOverrides] = useState<Record<string, ParamOverride>>({})
  const [scope, setScope] = useState<Scope>('global')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    if (template && !params) setParams(withDefaults(template.params))
  }, [template, params])
  useEffect(() => {
    // seed local overrides from DB once thumbnails arrive
    setOverrides((cur) =>
      Object.keys(cur).length ? cur : Object.fromEntries(thumbnails.map((t) => [t.id, t.overrides ?? {}])),
    )
    if (!selectedId && thumbnails.length) setSelectedId(thumbnails[0].id)
  }, [thumbnails, selectedId])

  const selected = thumbnails.find((t) => t.id === selectedId) ?? null
  const selOv = selectedId ? overrides[selectedId] ?? {} : {}
  const activeParams = params ? (scope === 'global' ? params : effectiveParams(params, selOv)) : null

  const globalDirty = useMemo(
    () => (template && params ? JSON.stringify(params) !== JSON.stringify(template.params) : false),
    [params, template],
  )
  const selDirty = useMemo(
    () => (selected ? JSON.stringify(selOv) !== JSON.stringify(selected.overrides ?? {}) : false),
    [selOv, selected],
  )
  const dirty = scope === 'global' ? globalDirty : selDirty

  if (tLoading || thLoading || !params || !activeParams) {
    return <div className="py-20 text-center text-slate-500">Loading studio…</div>
  }

  function set<K extends keyof TemplateParams>(key: K, value: TemplateParams[K]) {
    if (scope === 'global') setParams((p) => (p ? { ...p, [key]: value } : p))
    else if (selectedId)
      setOverrides((o) => ({ ...o, [selectedId]: { ...(o[selectedId] ?? {}), [key]: value } }))
  }
  function setLogo(patch: Partial<TemplateParams['logo']>) {
    if (scope === 'global') setParams((p) => (p ? { ...p, logo: { ...p.logo, ...patch } } : p))
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
      if (scope === 'global') await save(params)
      else if (selectedId) await saveOverrides(selectedId, selOv)
    } finally {
      setSaving(false)
    }
  }
  function handleReset() {
    if (scope === 'global') template && setParams(withDefaults(template.params))
    else if (selectedId) setOverrides((o) => ({ ...o, [selectedId]: {} }))
  }
  async function exportAll() {
    if (!params) return
    setExporting(true)
    try {
      for (const t of thumbnails) {
        await exportThumbPng(t, effectiveParams(params, overrides[t.id]))
        await new Promise((r) => setTimeout(r, 250))
      }
    } finally {
      setExporting(false)
    }
  }

  const swatches = PALETTES[activeParams.palette]
  const p = activeParams

  return (
    <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
      <aside className="space-y-4 lg:sticky lg:top-[76px] lg:max-h-[calc(100vh-92px)] lg:overflow-y-auto lg:pr-2">
        <div>
          <h1 className="text-lg font-semibold">Thumbnail Studio</h1>
          <p className="text-sm text-slate-400">{thumbnails.length} thumbnails · Figma-linked</p>
        </div>

        {/* Scope */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
          <div className="flex rounded-lg bg-slate-800 p-1 text-xs">
            <button
              onClick={() => setScope('global')}
              className={`flex-1 rounded-md py-1.5 ${scope === 'global' ? 'bg-slate-600 text-white' : 'text-slate-400'}`}
            >
              All thumbnails
            </button>
            <button
              onClick={() => setScope('selected')}
              disabled={!selected}
              className={`flex-1 rounded-md py-1.5 ${scope === 'selected' ? 'bg-slate-600 text-white' : 'text-slate-400'} disabled:opacity-40`}
            >
              This one
            </button>
          </div>
          <p className="mt-2 text-[11px] text-slate-500">
            {scope === 'global'
              ? 'Editing the template — applies to every thumbnail.'
              : `Overriding “${selected?.name}” only. Other games keep the template.`}
          </p>
        </div>

        {scope === 'global' && (
          <Section title="Frame size">
            <select
              value={p.sizeKey}
              onChange={(e) => set('sizeKey', e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm outline-none focus:border-brand"
            >
              {FRAME_SIZES.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
            <Toggle label="Corners" options={['sharp', 'friendly', 'playful']} value={p.cornerMode} onChange={(v) => set('cornerMode', v as TemplateParams['cornerMode'])} />
          </Section>
        )}

        <Section title="Colour">
          <Toggle label="Palette" options={['dark', 'light']} value={p.palette} onChange={(v) => set('palette', v as PaletteMode)} />
          <div className="flex flex-wrap gap-1.5 pt-1">
            {swatches.map((c) => (
              <button
                key={c.key}
                title={c.label}
                onClick={() => set('colorKey', c.key)}
                className={`h-7 w-7 rounded-full ring-2 ${p.colorKey === c.key ? 'ring-white' : 'ring-transparent'}`}
                style={{ background: c.stroke }}
              />
            ))}
          </div>
        </Section>

        <Section title="Background (fills frame)">
          <Slider label="Zoom" min={1} max={3} step={0.01} value={p.bgScale} onChange={(v) => set('bgScale', v)} suffix="×" />
          <p className="text-[11px] text-slate-500">Always centered &amp; fills the frame.</p>
        </Section>

        <Section title="Key visual (bottom, centered)">
          <Slider label="Size" min={20} max={120} value={p.kvSizePct} onChange={(v) => set('kvSizePct', v)} suffix="%" />
          <Slider label="Lift from bottom" min={-15} max={45} value={p.kvBottomPct} onChange={(v) => set('kvBottomPct', v)} suffix="%" />
        </Section>

        <Section title="Logo">
          <Toggle label="Variant" options={['color', 'white']} value={p.logoVariant} onChange={(v) => set('logoVariant', v as TemplateParams['logoVariant'])} />
          <Slider label="X" min={-0.1} max={1} step={0.005} value={p.logo.xPct} onChange={(v) => setLogo({ xPct: v })} pct />
          <Slider label="Y" min={0} max={1} step={0.005} value={p.logo.yPct} onChange={(v) => setLogo({ yPct: v })} pct />
          <Slider label="Width" min={0.1} max={1} step={0.005} value={p.logo.wPct} onChange={(v) => setLogo({ wPct: v })} pct />
          <Slider label="Height" min={0.05} max={0.6} step={0.005} value={p.logo.hPct} onChange={(v) => setLogo({ hPct: v })} pct />
        </Section>

        {scope === 'global' && (
          <Section title="Provider label">
            <label className="flex items-center justify-between text-xs text-slate-400">
              Show
              <input type="checkbox" checked={p.showProvider} onChange={(e) => set('showProvider', e.target.checked)} />
            </label>
            <Toggle label="Placement" options={['bottom', 'top']} value={p.providerPos} onChange={(v) => set('providerPos', v as TemplateParams['providerPos'])} />
            <Slider label="Corner radius" min={0} max={30} value={p.providerRadius} onChange={(v) => set('providerRadius', v)} />
          </Section>
        )}

        <div className="flex gap-2">
          <button
            onClick={handleSave}
            disabled={saving || !dirty}
            className="flex-1 rounded-lg bg-brand py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
          >
            {saving ? 'Saving…' : dirty ? (scope === 'global' ? 'Save template' : `Save “${selected?.name}”`) : 'Saved'}
          </button>
          <button onClick={handleReset} disabled={!dirty} className="rounded-lg border border-slate-700 px-3 py-2 text-sm disabled:opacity-40">
            {scope === 'global' ? 'Reset' : 'Clear'}
          </button>
        </div>
      </aside>

      <div className="flex flex-wrap items-start gap-6">
        {selected && (
          <div className="shrink-0 self-start lg:sticky lg:top-[76px]">
            <ThumbnailCard thumb={selected} params={effectiveParams(params, overrides[selected.id])} assets={assetsFor(selected)} displayW={300} />
            <div className="mt-3 flex items-center gap-2">
              <span className="text-sm text-slate-300">{selected.name}</span>
              <button onClick={() => exportThumbPng(selected, effectiveParams(params, overrides[selected.id]))} className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs hover:bg-slate-800">
                Export PNG
              </button>
            </div>
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm text-slate-400">All thumbnails ({thumbnails.length})</span>
            <button onClick={exportAll} disabled={exporting} className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs hover:bg-slate-800 disabled:opacity-60">
              {exporting ? 'Exporting…' : 'Export all'}
            </button>
          </div>
          <div className="flex flex-wrap gap-4">
            {thumbnails.map((t) => {
              const hasOv = Object.keys(overrides[t.id] ?? {}).length > 0
              return (
                <button
                  key={t.id}
                  onClick={() => setSelectedId(t.id)}
                  className={`relative rounded-xl p-1 ${t.id === selectedId ? 'ring-2 ring-brand' : 'ring-1 ring-slate-800'}`}
                  title={t.name}
                >
                  <ThumbnailCard thumb={t} params={effectiveParams(params, overrides[t.id])} assets={assetsFor(t)} displayW={170} />
                  {hasOv && (
                    <span className="absolute right-2 top-2 rounded-full bg-brand px-1.5 py-0.5 text-[9px] font-semibold text-white">
                      custom
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

function Toggle({ label, options, value, onChange }: { label: string; options: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <div className="mb-1 text-[11px] text-slate-400">{label}</div>
      <div className="flex rounded-lg bg-slate-800 p-1 text-xs">
        {options.map((o) => (
          <button key={o} onClick={() => onChange(o)} className={`flex-1 rounded-md py-1.5 capitalize ${value === o ? 'bg-slate-600 text-white' : 'text-slate-400'}`}>
            {o}
          </button>
        ))}
      </div>
    </div>
  )
}

function Slider({ label, min, max, step = 1, value, onChange, suffix, pct }: { label: string; min: number; max: number; step?: number; value: number; onChange: (v: number) => void; suffix?: string; pct?: boolean }) {
  return (
    <label className="block">
      <div className="mb-0.5 flex items-center justify-between text-[11px] text-slate-400">
        <span>{label}</span>
        <span className="tabular-nums text-slate-300">
          {pct ? `${Math.round(value * 100)}%` : step < 1 ? value.toFixed(2) : Math.round(value)}
          {suffix ?? ''}
        </span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-brand" />
    </label>
  )
}
