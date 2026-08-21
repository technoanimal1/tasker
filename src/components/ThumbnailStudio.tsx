import { useEffect, useMemo, useState } from 'react'
import { useTemplate } from '../hooks/useTemplate'
import { useThumbnailsData } from '../hooks/useThumbnailsData'
import { FRAME_SIZES, withDefaults, type TemplateParams } from '../lib/thumb'
import { PALETTES, type PaletteMode } from '../lib/palettes'
import { ThumbnailCard } from './Thumbnail'
import { exportThumbPng } from '../lib/exportThumb'

export function ThumbnailStudio() {
  const { template, loading: tLoading, save } = useTemplate()
  const { thumbnails, loading: thLoading } = useThumbnailsData()

  const [params, setParams] = useState<TemplateParams | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    if (template && !params) setParams(withDefaults(template.params))
  }, [template, params])
  useEffect(() => {
    if (!selectedId && thumbnails.length) setSelectedId(thumbnails[0].id)
  }, [thumbnails, selectedId])

  const dirty = useMemo(
    () => (template && params ? JSON.stringify(params) !== JSON.stringify(template.params) : false),
    [params, template],
  )
  const selected = thumbnails.find((t) => t.id === selectedId) ?? null

  if (tLoading || thLoading || !params) {
    return <div className="py-20 text-center text-slate-500">Loading studio…</div>
  }

  function set<K extends keyof TemplateParams>(key: K, value: TemplateParams[K]) {
    setParams((p) => (p ? { ...p, [key]: value } : p))
  }
  function setLogo(patch: Partial<TemplateParams['logo']>) {
    setParams((p) => (p ? { ...p, logo: { ...p.logo, ...patch } } : p))
  }

  async function handleSave() {
    if (!params) return
    setSaving(true)
    try {
      await save(params)
    } finally {
      setSaving(false)
    }
  }
  async function exportAll() {
    if (!params) return
    setExporting(true)
    try {
      for (const t of thumbnails) {
        await exportThumbPng(t, params)
        await new Promise((r) => setTimeout(r, 250))
      }
    } finally {
      setExporting(false)
    }
  }

  const swatches = PALETTES[params.palette]

  return (
    <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
      <aside className="space-y-4">
        <div>
          <h1 className="text-lg font-semibold">Thumbnail Studio</h1>
          <p className="text-sm text-slate-400">
            One template · {thumbnails.length} thumbnails · edits apply to all.
          </p>
        </div>

        <Section title="Frame size">
          <select
            value={params.sizeKey}
            onChange={(e) => set('sizeKey', e.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm outline-none focus:border-brand"
          >
            {FRAME_SIZES.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
          <Toggle
            label="Corners"
            options={['sharp', 'friendly', 'playful']}
            value={params.cornerMode}
            onChange={(v) => set('cornerMode', v as TemplateParams['cornerMode'])}
          />
        </Section>

        <Section title="Colour">
          <Toggle
            label="Palette"
            options={['dark', 'light']}
            value={params.palette}
            onChange={(v) => set('palette', v as PaletteMode)}
          />
          <div className="flex flex-wrap gap-1.5 pt-1">
            {swatches.map((c) => (
              <button
                key={c.key}
                title={c.label}
                onClick={() => set('colorKey', c.key)}
                className={`h-7 w-7 rounded-full ring-2 ${params.colorKey === c.key ? 'ring-white' : 'ring-transparent'}`}
                style={{ background: c.stroke }}
              />
            ))}
          </div>
        </Section>

        <Section title="Background (fills frame)">
          <Slider label="Zoom" min={1} max={3} step={0.01} value={params.bgScale} onChange={(v) => set('bgScale', v)} suffix="×" />
          <Slider label="Offset X" min={-0.3} max={0.3} step={0.005} value={params.bgOffsetXPct} onChange={(v) => set('bgOffsetXPct', v)} pct />
          <Slider label="Offset Y" min={-0.3} max={0.3} step={0.005} value={params.bgOffsetYPct} onChange={(v) => set('bgOffsetYPct', v)} pct />
        </Section>

        <Section title="Key visual (bottom, centered)">
          <Slider label="Size" min={20} max={120} value={params.kvSizePct} onChange={(v) => set('kvSizePct', v)} suffix="%" />
          <Slider label="Lift from bottom" min={-15} max={45} value={params.kvBottomPct} onChange={(v) => set('kvBottomPct', v)} suffix="%" />
        </Section>

        <Section title="Logo">
          <Toggle
            label="Variant"
            options={['color', 'white']}
            value={params.logoVariant}
            onChange={(v) => set('logoVariant', v as TemplateParams['logoVariant'])}
          />
          <Slider label="X" min={-0.1} max={1} step={0.005} value={params.logo.xPct} onChange={(v) => setLogo({ xPct: v })} pct />
          <Slider label="Y" min={0} max={1} step={0.005} value={params.logo.yPct} onChange={(v) => setLogo({ yPct: v })} pct />
          <Slider label="Width" min={0.1} max={1} step={0.005} value={params.logo.wPct} onChange={(v) => setLogo({ wPct: v })} pct />
          <Slider label="Height" min={0.05} max={0.6} step={0.005} value={params.logo.hPct} onChange={(v) => setLogo({ hPct: v })} pct />
          <label className="flex items-center justify-between pt-1 text-xs text-slate-400">
            Show provider label
            <input type="checkbox" checked={params.showProvider} onChange={(e) => set('showProvider', e.target.checked)} />
          </label>
        </Section>

        <div className="flex gap-2">
          <button
            onClick={handleSave}
            disabled={saving || !dirty}
            className="flex-1 rounded-lg bg-brand py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
          >
            {saving ? 'Saving…' : dirty ? 'Save template' : 'Saved'}
          </button>
          <button
            onClick={() => template && setParams(withDefaults(template.params))}
            disabled={!dirty}
            className="rounded-lg border border-slate-700 px-3 py-2 text-sm disabled:opacity-40"
          >
            Reset
          </button>
        </div>
      </aside>

      <div className="flex flex-wrap items-start gap-6">
        {selected && (
          <div className="shrink-0">
            <ThumbnailCard thumb={selected} params={params} displayW={300} />
            <div className="mt-3 flex items-center gap-2">
              <span className="text-sm text-slate-300">{selected.name}</span>
              <button
                onClick={() => exportThumbPng(selected, params)}
                className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs hover:bg-slate-800"
              >
                Export PNG
              </button>
            </div>
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm text-slate-400">All thumbnails ({thumbnails.length})</span>
            <button
              onClick={exportAll}
              disabled={exporting}
              className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs hover:bg-slate-800 disabled:opacity-60"
            >
              {exporting ? 'Exporting…' : 'Export all'}
            </button>
          </div>
          <div className="flex flex-wrap gap-4">
            {thumbnails.map((t) => (
              <button
                key={t.id}
                onClick={() => setSelectedId(t.id)}
                className={`rounded-xl p-1 ${t.id === selectedId ? 'ring-2 ring-brand' : 'ring-1 ring-slate-800'}`}
                title={t.name}
              >
                <ThumbnailCard thumb={t} params={params} displayW={170} />
              </button>
            ))}
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

function Toggle({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: string[]
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div>
      <div className="mb-1 text-[11px] text-slate-400">{label}</div>
      <div className="flex rounded-lg bg-slate-800 p-1 text-xs">
        {options.map((o) => (
          <button
            key={o}
            onClick={() => onChange(o)}
            className={`flex-1 rounded-md py-1.5 capitalize ${value === o ? 'bg-slate-600 text-white' : 'text-slate-400'}`}
          >
            {o}
          </button>
        ))}
      </div>
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
  suffix,
  pct,
}: {
  label: string
  min: number
  max: number
  step?: number
  value: number
  onChange: (v: number) => void
  suffix?: string
  pct?: boolean
}) {
  return (
    <label className="block">
      <div className="mb-0.5 flex items-center justify-between text-[11px] text-slate-400">
        <span>{label}</span>
        <span className="tabular-nums text-slate-300">
          {pct ? `${Math.round(value * 100)}%` : step < 1 ? value.toFixed(2) : Math.round(value)}
          {suffix ?? ''}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-brand"
      />
    </label>
  )
}
