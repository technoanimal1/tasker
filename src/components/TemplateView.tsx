import { useEffect, useMemo, useState } from 'react'
import { useTemplate } from '../hooks/useTemplate'
import { useThumbnailsData } from '../hooks/useThumbnailsData'
import { useFigmaAssets } from '../hooks/useFigmaAssets'
import {
  ALIGN9,
  FRAME_SIZES,
  GRAD_DIRS,
  PROVIDER_CASES,
  PROVIDER_POSITIONS,
  defaultLayout,
  resolveGrad,
  withDefaults,
  type Align9,
  type GradientParams,
  type ProviderPos,
  type SizeLayout,
  type TemplateParams,
} from '../lib/thumb'
import { ThumbnailCard } from './Thumbnail'

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
  const [saving, setSaving] = useState(false)
  const [previewIdx, setPreviewIdx] = useState(0)
  // Preview width tracks the viewport so the card fits on mobile (no clipping).
  const [vw, setVw] = useState(() => (typeof window !== 'undefined' ? window.innerWidth : 800))

  useEffect(() => {
    if (template) setParams(withDefaults(template.params))
  }, [template])

  useEffect(() => {
    loadPage(0, 24)
  }, [loadPage])

  useEffect(() => {
    const onR = () => setVw(window.innerWidth)
    window.addEventListener('resize', onR)
    return () => window.removeEventListener('resize', onR)
  }, [])

  const dirty = useMemo(
    () => (template && params ? JSON.stringify(params) !== JSON.stringify(withDefaults(template.params)) : false),
    [params, template],
  )
  const sample = pageItems[previewIdx] ?? pageItems[0] ?? null

  // Resolve the sample's Figma-only layers (assets not yet on our CDN) on demand.
  useEffect(() => {
    if (sample) ensureResolved(sample)
  }, [sample, ensureResolved])

  if (loading || !params) {
    return <div className="py-20 text-center text-zinc-500">Loading template…</div>
  }

  // Desktop shows a large preview; mobile pins a small tile so you can watch the
  // design change while the controls scroll beneath it.
  const isWide = vw >= 1024
  const previewW = isWide ? 360 : 150

  const sizeKey = params.sizeKey
  const lay = params.layouts?.[sizeKey] ?? defaultLayout(sizeKey)
  const grad = resolveGrad(params)

  const setSize = (key: string) => setParams((p) => (p ? { ...p, sizeKey: key } : p))
  const setLayout = (patch: Partial<SizeLayout>) =>
    setParams((p) => {
      if (!p) return p
      const cur = p.layouts?.[p.sizeKey] ?? defaultLayout(p.sizeKey)
      return { ...p, layouts: { ...(p.layouts ?? {}), [p.sizeKey]: { ...cur, ...patch } } }
    })
  const setGrad = (patch: Partial<GradientParams>) =>
    setParams((p) => {
      if (!p) return p
      const cur = resolveGrad(p)
      return { ...p, gradients: { ...(p.gradients ?? {}), [p.sizeKey]: { ...cur, ...patch } } }
    })
  // Provider label styling is product-wide (not per aspect size).
  const setP = (patch: Partial<TemplateParams>) => setParams((p) => (p ? { ...p, ...patch } : p))

  async function saveAll() {
    if (!params) return
    setSaving(true)
    try {
      await save(params)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Template controller</h1>
          <p className="text-sm text-zinc-400">
            Master layout &amp; gradient per aspect size. Saving applies to <b>every thumbnail</b> on the product.
          </p>
        </div>
        <button
          onClick={saveAll}
          disabled={saving || !dirty}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-dark disabled:opacity-50"
        >
          {saving ? 'Saving…' : dirty ? 'Save template' : 'Saved'}
        </button>
      </div>

      {/* aspect switcher */}
      <div className="mb-5 flex flex-wrap gap-1.5">
        {FRAME_SIZES.map((s) => (
          <button
            key={s.key}
            onClick={() => setSize(s.key)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
              sizeKey === s.key ? 'bg-accent text-white' : 'bg-zinc-800/70 text-zinc-300 hover:bg-zinc-700'
            }`}
          >
            {s.key}
          </button>
        ))}
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
          ) : (
            <p className="text-sm text-zinc-500">{pageLoading ? 'Loading a preview game…' : 'No thumbnails to preview yet.'}</p>
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

          <Section title={`Logo position · ${sizeKey}`}>
            <LogoPresetBar value={lay.logoAlign} onChange={(a) => setLayout({ logoAlign: a })} />
            <Row label="Fine (9-point)">
              <AlignGrid value={lay.logoAlign} onChange={(a) => setLayout({ logoAlign: a })} />
            </Row>
            <Slider label="Logo size" min={0.1} max={3} step={0.02} value={lay.logoScale} onChange={(v) => setLayout({ logoScale: v })} fmt={(v) => `${Math.round(v * 100)}%`} />
            <div className="grid grid-cols-2 gap-2">
              <Slider label="Offset X" min={-0.5} max={0.5} step={0.01} value={lay.logoDX ?? 0} onChange={(v) => setLayout({ logoDX: v })} fmt={(v) => `${Math.round(v * 100)}%`} />
              <Slider label="Offset Y" min={-0.5} max={0.5} step={0.01} value={lay.logoDY ?? 0} onChange={(v) => setLayout({ logoDY: v })} fmt={(v) => `${Math.round(v * 100)}%`} />
            </div>
          </Section>

          <Section title={`Key visual · ${sizeKey}`}>
            <Row label="Position">
              <AlignGrid value={lay.kvAlign} onChange={(a) => setLayout({ kvAlign: a })} />
            </Row>
            <Slider label="KV size" min={0.3} max={5} step={0.02} value={lay.kvScale} onChange={(v) => setLayout({ kvScale: v })} fmt={(v) => `${Math.round(v * 100)}%`} />
            <div className="grid grid-cols-2 gap-2">
              <Slider label="Offset X" min={-0.5} max={0.5} step={0.01} value={lay.kvDX ?? 0} onChange={(v) => setLayout({ kvDX: v })} fmt={(v) => `${Math.round(v * 100)}%`} />
              <Slider label="Offset Y" min={-0.5} max={0.5} step={0.01} value={lay.kvDY ?? 0} onChange={(v) => setLayout({ kvDY: v })} fmt={(v) => `${Math.round(v * 100)}%`} />
            </div>
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
                    {d === 'bottom' ? '↓' : d === 'top' ? '↑' : d === 'left' ? '←' : '→'}
                  </button>
                ))}
              </div>
            </Row>
            <Slider label="Top fade" min={0} max={100} value={grad.gradStop1} onChange={(v) => setGrad({ gradStop1: v })} fmt={(v) => `${Math.round(v)}%`} />
            <Slider label="Colour stop" min={0} max={100} value={grad.gradStop2} onChange={(v) => setGrad({ gradStop2: v })} fmt={(v) => `${Math.round(v)}%`} />
            <Slider label="Bottom fade" min={0} max={100} value={grad.gradBottom} onChange={(v) => setGrad({ gradBottom: v })} fmt={(v) => `${Math.round(v)}%`} />
            <Slider label="Opacity" min={0} max={1} step={0.02} value={grad.gradOpacity} onChange={(v) => setGrad({ gradOpacity: v })} fmt={(v) => `${Math.round(v * 100)}%`} />
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

          <Section title="Provider label">
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
            <Slider label="Size" min={0.5} max={2.5} step={0.05} value={params.providerScale} onChange={(v) => setP({ providerScale: v })} fmt={(v) => `${Math.round(v * 100)}%`} />
            <div className="grid grid-cols-2 gap-2">
              <Slider label="Margin X" min={0} max={60} value={params.providerMarginX} onChange={(v) => setP({ providerMarginX: v })} fmt={(v) => `${Math.round(v)}`} />
              <Slider label="Margin Y" min={0} max={60} value={params.providerMarginY} onChange={(v) => setP({ providerMarginY: v })} fmt={(v) => `${Math.round(v)}`} />
              <Slider label="Pad X" min={0} max={40} value={params.providerPadX} onChange={(v) => setP({ providerPadX: v })} fmt={(v) => `${Math.round(v)}`} />
              <Slider label="Pad Y" min={0} max={40} value={params.providerPadY} onChange={(v) => setP({ providerPadY: v })} fmt={(v) => `${Math.round(v)}`} />
              <Slider label="R ◜" min={0} max={40} value={params.providerRadius.tl} onChange={(v) => setP({ providerRadius: { ...params.providerRadius, tl: v } })} fmt={(v) => `${Math.round(v)}`} />
              <Slider label="R ◝" min={0} max={40} value={params.providerRadius.tr} onChange={(v) => setP({ providerRadius: { ...params.providerRadius, tr: v } })} fmt={(v) => `${Math.round(v)}`} />
              <Slider label="R ◟" min={0} max={40} value={params.providerRadius.bl} onChange={(v) => setP({ providerRadius: { ...params.providerRadius, bl: v } })} fmt={(v) => `${Math.round(v)}`} />
              <Slider label="R ◞" min={0} max={40} value={params.providerRadius.br} onChange={(v) => setP({ providerRadius: { ...params.providerRadius, br: v } })} fmt={(v) => `${Math.round(v)}`} />
            </div>
            <p className="text-[11px] text-zinc-500">The badge text is each game's provider. Styling here applies to every thumbnail.</p>
          </Section>

          <p className="text-[11px] text-zinc-500">Everything here is saved per aspect size and applies to all thumbnails at that size.</p>
        </aside>
      </div>
    </div>
  )
}

// ── small quick logo-position bar (5 common spots) ───────────────────────────
const LOGO_PRESETS: { align: Align9; dot: [number, number] }[] = [
  { align: 'tc', dot: [0.5, 0.16] },
  { align: 'ml', dot: [0.18, 0.5] },
  { align: 'mc', dot: [0.5, 0.5] },
  { align: 'mr', dot: [0.82, 0.5] },
  { align: 'bc', dot: [0.5, 0.84] },
]

function LogoPresetBar({ value, onChange }: { value: Align9; onChange: (a: Align9) => void }) {
  return (
    <div className="flex gap-2">
      {LOGO_PRESETS.map((p) => {
        const active = value === p.align
        return (
          <button
            key={p.align}
            onClick={() => onChange(p.align)}
            className={`relative h-11 flex-1 rounded-md border transition ${
              active ? 'border-accent bg-accent/10' : 'border-zinc-700 bg-zinc-800/50 hover:border-zinc-500'
            }`}
          >
            <span
              className={`absolute h-2.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-[2px] ${active ? 'bg-accent' : 'bg-zinc-400'}`}
              style={{ left: `${p.dot[0] * 100}%`, top: `${p.dot[1] * 100}%` }}
            />
          </button>
        )
      })}
    </div>
  )
}

function AlignGrid({ value, onChange }: { value: Align9; onChange: (a: Align9) => void }) {
  return (
    <div className="grid grid-cols-3 gap-0.5 rounded-md bg-zinc-800/70 p-0.5">
      {ALIGN9.map((a) => {
        const active = value === a
        return (
          <button
            key={a}
            onClick={() => onChange(a)}
            className={`grid h-6 w-6 place-items-center rounded-[3px] transition ${
              active ? 'bg-accent' : 'hover:bg-zinc-700'
            }`}
          >
            <span className={`h-2 w-2 rounded-[1px] ${active ? 'bg-zinc-900' : 'bg-zinc-500'}`} />
          </button>
        )
      })}
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
  const frac = Math.max(0, Math.min(1, (value - min) / (max - min)))
  return (
    <label className="relative flex h-9 cursor-ew-resize select-none items-center justify-between overflow-hidden rounded-lg bg-zinc-800/50 px-3">
      <span className="pointer-events-none absolute inset-y-0 left-0 bg-zinc-700/45" style={{ width: `${frac * 100}%` }} />
      <span className="relative z-10 text-xs text-zinc-300">{label}</span>
      <span className="relative z-10 text-xs tabular-nums text-zinc-100">{fmt(value)}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="absolute inset-0 z-20 h-full w-full cursor-ew-resize opacity-0"
      />
    </label>
  )
}
