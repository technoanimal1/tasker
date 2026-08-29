import { useEffect, useMemo, useState } from 'react'
import type { Branch } from '../lib/types'
import { useTemplate } from '../hooks/useTemplate'
import { useThumbnailsData } from '../hooks/useThumbnailsData'
import { useFigmaAssets } from '../hooks/useFigmaAssets'
import {
  CORNER_MODES,
  PROVIDER_POSITIONS,
  branchParams,
  resolveGrad,
  withDefaults,
  type GradientParams,
  type ParamOverride,
  type TemplateParams,
} from '../lib/thumb'
import { ThumbnailCard } from './Thumbnail'

interface Props {
  branch: Branch
  saveFrameParams: (id: string, frame_params: Record<string, unknown>) => Promise<void>
}

/**
 * Per-branch Frame Design builder. Edits the active branch's frame_params (the
 * frame that every thumbnail on this branch inherits) with a live preview.
 * Designers set a client's frame here; the Thumbnails page then shows it when
 * that branch is selected.
 */
export function FramesView({ branch, saveFrameParams }: Props) {
  const { template, loading: tLoading } = useTemplate()
  const { thumbnails, loading: thLoading } = useThumbnailsData()
  const { assetsFor } = useFigmaAssets(thumbnails)

  const [fp, setFp] = useState<ParamOverride>({})
  const [saving, setSaving] = useState(false)
  const [previewIdx, setPreviewIdx] = useState(0)

  useEffect(() => {
    setFp((branch.frame_params as ParamOverride) ?? {})
  }, [branch.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const base = useMemo(() => (template ? withDefaults(template.params) : null), [template])
  const p = base ? branchParams(base, fp) : null
  const dirty = JSON.stringify(fp) !== JSON.stringify(branch.frame_params ?? {})
  const sample = thumbnails[previewIdx] ?? thumbnails[0] ?? null

  if (tLoading || thLoading || !base || !p) {
    return <div className="py-20 text-center text-zinc-500">Loading frame design…</div>
  }

  function set<K extends keyof TemplateParams>(key: K, value: TemplateParams[K]) {
    setFp((cur) => ({ ...cur, [key]: value }))
  }
  // Edit the effective gradient: per-size when one is active, else the flat globals.
  function setGrad<K extends keyof GradientParams>(key: K, value: number) {
    const size = p!.sizeKey
    setFp((cur) => {
      const per = cur.gradients?.[size]
      if (per) return { ...cur, gradients: { ...(cur.gradients ?? {}), [size]: { ...per, [key]: value } } }
      return { ...cur, [key]: value }
    })
  }

  async function save() {
    setSaving(true)
    try {
      await saveFrameParams(branch.id, fp)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">
            Frame design <span className="text-zinc-500">· {branch.name}</span>
          </h1>
          <p className="text-sm text-zinc-400">
            The frame every thumbnail on this branch inherits. Select <b>{branch.name}</b> on the Thumbnails page to see it applied.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setFp((branch.frame_params as ParamOverride) ?? {})}
            disabled={!dirty}
            className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 disabled:opacity-40"
          >
            Reset
          </button>
          <button
            onClick={save}
            disabled={saving || !dirty}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-zinc-900 hover:bg-accent-dark disabled:opacity-50"
          >
            {saving ? 'Saving…' : dirty ? 'Save frame' : 'Saved'}
          </button>
        </div>
      </div>

      {branch.is_default && (
        <div className="mb-4 rounded-xl border border-zinc-800 bg-zinc-800/30 p-3 text-xs text-zinc-400">
          <b className="text-zinc-300">main</b> is the general template. Create a client branch (top bar → New) to design that client’s own frame here — it then shows on the Thumbnails page whenever that branch is selected.
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* preview */}
        <div
          className="flex min-h-[520px] items-center justify-center rounded-2xl border border-zinc-800 p-8"
          style={{ backgroundImage: 'radial-gradient(circle at center, #1a1c22 1px, transparent 1px)', backgroundSize: '22px 22px' }}
        >
          {sample ? (
            <div className="shadow-2xl">
              <ThumbnailCard thumb={sample} params={p} assets={assetsFor(sample)} displayW={360} />
            </div>
          ) : (
            <p className="text-sm text-zinc-500">No thumbnails to preview yet.</p>
          )}
        </div>

        {/* controls */}
        <aside className="flex flex-col gap-3.5 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-3">
          {thumbnails.length > 1 && (
            <Row label="Preview game">
              <select
                value={previewIdx}
                onChange={(e) => setPreviewIdx(Number(e.target.value))}
                className="max-w-[200px] rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs outline-none focus:border-zinc-500"
              >
                {thumbnails.map((t, i) => (
                  <option key={t.id} value={i}>
                    {t.name}
                  </option>
                ))}
              </select>
            </Row>
          )}

          <Section title="Frame">
            <Seg
              options={Object.keys(CORNER_MODES).map((o) => ({ value: o, label: o }))}
              value={p.cornerMode}
              onChange={(v) => set('cornerMode', v as TemplateParams['cornerMode'])}
            />
            <Slider label="Stroke weight" min={0} max={12} step={0.5} value={p.strokeWidth} onChange={(v) => set('strokeWidth', v)} fmt={(v) => `${v}`} />
            <Slider label="Padding" min={0} max={24} step={0.5} value={p.strokePad} onChange={(v) => set('strokePad', v)} fmt={(v) => `${v}`} />
            <Seg
              options={[
                { value: 'inside', label: 'inside' },
                { value: 'outside', label: 'outside' },
              ]}
              value={p.strokePos}
              onChange={(v) => set('strokePos', v as TemplateParams['strokePos'])}
            />
          </Section>

          <Section title="Provider badge">
            <Row label="Show">
              <input type="checkbox" checked={p.showProvider} onChange={(e) => set('showProvider', e.target.checked)} />
            </Row>
            <Row label="Placement">
              <select
                value={p.providerPos}
                onChange={(e) => set('providerPos', e.target.value as TemplateParams['providerPos'])}
                className="rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs outline-none focus:border-zinc-500"
              >
                {PROVIDER_POSITIONS.map((o) => (
                  <option key={o} value={o}>
                    {o.replace('-', ' ')}
                  </option>
                ))}
              </select>
            </Row>
            <Row label="Name">
              <input
                value={p.providerName}
                onChange={(e) => set('providerName', e.target.value)}
                placeholder={sample?.provider ?? 'per game'}
                className="w-[150px] rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs outline-none focus:border-zinc-500"
              />
            </Row>
            <Slider label="Size" min={0.4} max={3} step={0.05} value={p.providerScale} onChange={(v) => set('providerScale', v)} fmt={(v) => `${Math.round(v * 100)}%`} />
            <div className="grid grid-cols-2 gap-2">
              <Slider label="Space X" min={0} max={80} value={p.providerMarginX} onChange={(v) => set('providerMarginX', v)} fmt={(v) => `${Math.round(v)}`} />
              <Slider label="Space Y" min={0} max={80} value={p.providerMarginY} onChange={(v) => set('providerMarginY', v)} fmt={(v) => `${Math.round(v)}`} />
              <Slider label="Pad X" min={0} max={40} value={p.providerPadX} onChange={(v) => set('providerPadX', v)} fmt={(v) => `${Math.round(v)}`} />
              <Slider label="Pad Y" min={0} max={40} value={p.providerPadY} onChange={(v) => set('providerPadY', v)} fmt={(v) => `${Math.round(v)}`} />
              <Slider label="R ◜" min={0} max={40} value={p.providerRadius.tl} onChange={(v) => set('providerRadius', { ...p.providerRadius, tl: v })} fmt={(v) => `${Math.round(v)}`} />
              <Slider label="R ◝" min={0} max={40} value={p.providerRadius.tr} onChange={(v) => set('providerRadius', { ...p.providerRadius, tr: v })} fmt={(v) => `${Math.round(v)}`} />
              <Slider label="R ◟" min={0} max={40} value={p.providerRadius.bl} onChange={(v) => set('providerRadius', { ...p.providerRadius, bl: v })} fmt={(v) => `${Math.round(v)}`} />
              <Slider label="R ◞" min={0} max={40} value={p.providerRadius.br} onChange={(v) => set('providerRadius', { ...p.providerRadius, br: v })} fmt={(v) => `${Math.round(v)}`} />
            </div>
          </Section>

          <Section title="Light band">
            {(() => {
              const g = resolveGrad(p)
              return (
                <>
                  <Slider label="Top fade" min={0} max={100} value={g.gradStop1} onChange={(v) => setGrad('gradStop1', v)} fmt={(v) => `${Math.round(v)}%`} />
                  <Slider label="Colour stop" min={0} max={100} value={g.gradStop2} onChange={(v) => setGrad('gradStop2', v)} fmt={(v) => `${Math.round(v)}%`} />
                  <Slider label="Bottom fade" min={0} max={100} value={g.gradBottom} onChange={(v) => setGrad('gradBottom', v)} fmt={(v) => `${Math.round(v)}%`} />
                  <Slider label="Opacity" min={0} max={1} step={0.02} value={g.gradOpacity} onChange={(v) => setGrad('gradOpacity', v)} fmt={(v) => `${Math.round(v * 100)}%`} />
                  <Slider label="Band height" min={10} max={80} value={g.gradBandPct} onChange={(v) => setGrad('gradBandPct', v)} fmt={(v) => `${Math.round(v)}%`} />
                </>
              )
            })()}
          </Section>
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

function Seg({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string }[]
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="flex rounded-lg bg-zinc-800/70 p-0.5 text-xs">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`flex-1 rounded py-1 capitalize transition ${
            value === o.value ? 'bg-zinc-700 font-medium text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'
          }`}
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
