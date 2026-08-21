import { useEffect, useMemo, useState } from 'react'
import { useTemplate } from '../hooks/useTemplate'
import { useThumbnailsData } from '../hooks/useThumbnailsData'
import { CARD_W, withDefaults, type TemplateParams } from '../lib/thumb'
import { ThumbnailCard } from './Thumbnail'
import { exportThumbPng } from '../lib/exportThumb'

export function ThumbnailStudio() {
  const { template, loading: tLoading, save } = useTemplate()
  const { thumbnails, loading: thLoading, setAccent } = useThumbnailsData()

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

  return (
    <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
      {/* Editor */}
      <aside className="space-y-5">
        <div>
          <h1 className="text-lg font-semibold">Thumbnail Studio</h1>
          <p className="text-sm text-slate-400">
            One template drives every thumbnail. Adjust below — all {thumbnails.length} update live.
          </p>
        </div>

        <Section title="Logo">
          <div className="mb-1 flex rounded-lg bg-slate-800 p-1 text-xs">
            {(['color', 'white'] as const).map((v) => (
              <button
                key={v}
                onClick={() => set('logoVariant', v)}
                className={`flex-1 rounded-md py-1.5 capitalize ${params.logoVariant === v ? 'bg-slate-600 text-white' : 'text-slate-400'}`}
              >
                {v}
              </button>
            ))}
          </div>
          <Slider label="X" min={-40} max={CARD_W} value={params.logo.x} onChange={(v) => setLogo({ x: v })} />
          <Slider label="Y" min={0} max={340} value={params.logo.y} onChange={(v) => setLogo({ y: v })} />
          <Slider label="Width" min={40} max={CARD_W} value={params.logo.w} onChange={(v) => setLogo({ w: v })} />
          <Slider label="Height" min={30} max={220} value={params.logo.h} onChange={(v) => setLogo({ h: v })} />
        </Section>

        <Section title="Background">
          <Slider label="Scale" min={0.6} max={2.5} step={0.01} value={params.bgScale} onChange={(v) => set('bgScale', v)} suffix="×" />
          <Slider label="Offset X" min={-120} max={120} value={params.bgOffsetX} onChange={(v) => set('bgOffsetX', v)} />
          <Slider label="Offset Y" min={-120} max={120} value={params.bgOffsetY} onChange={(v) => set('bgOffsetY', v)} />
        </Section>

        <Section title="Key visual (centered)">
          <Slider label="Scale" min={0.3} max={2} step={0.01} value={params.kvScale} onChange={(v) => set('kvScale', v)} suffix="×" />
          <Slider label="Offset Y" min={-160} max={160} value={params.kvOffsetY} onChange={(v) => set('kvOffsetY', v)} />
        </Section>

        <Section title="Frame">
          <Slider label="Corner radius" min={0} max={40} value={params.cornerRadius} onChange={(v) => set('cornerRadius', v)} />
          <label className="flex items-center justify-between text-xs text-slate-400">
            Show provider label
            <input
              type="checkbox"
              checked={params.showProvider}
              onChange={(e) => set('showProvider', e.target.checked)}
            />
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

      {/* Preview + grid */}
      <div className="space-y-6">
        <div className="flex flex-wrap items-start gap-6">
          {selected && (
            <div className="shrink-0">
              <ThumbnailCard thumb={selected} params={params} scale={1.15} />
              <div className="mt-3 flex items-center gap-2">
                <label className="text-xs text-slate-400">Accent</label>
                <input
                  type="color"
                  value={selected.accent_color}
                  onChange={(e) => setAccent(selected.id, e.target.value)}
                  className="h-7 w-10 cursor-pointer rounded border border-slate-700 bg-slate-950"
                />
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
                  <ThumbnailCard thumb={t} params={params} scale={0.62} />
                </button>
              ))}
            </div>
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

function Slider({
  label,
  min,
  max,
  step = 1,
  value,
  onChange,
  suffix,
}: {
  label: string
  min: number
  max: number
  step?: number
  value: number
  onChange: (v: number) => void
  suffix?: string
}) {
  return (
    <label className="block">
      <div className="mb-0.5 flex items-center justify-between text-[11px] text-slate-400">
        <span>{label}</span>
        <span className="tabular-nums text-slate-300">
          {step < 1 ? value.toFixed(2) : Math.round(value)}
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
