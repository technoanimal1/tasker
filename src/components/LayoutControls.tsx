import { useState } from 'react'
import { ALIGN9, type Align9, type SizeLayout } from '../lib/thumb'

/**
 * Shared key-visual / logo layout controls — one editing surface used by BOTH
 * the master Template editor and the per-thumbnail Layout section, so the two
 * places offer identical preferences: 9-point position (plus quick presets for
 * the logo), uniform size, fine X/Y offsets, and KV auto-centre. Only the
 * storage target differs (template per size vs. per-thumbnail override) — the
 * caller wires `onLayout` / `onAutoCenter` to its own setter.
 */

/** Percent-style value: shown as "40%", typed as plain "40", stored as 0.4. */
const pct = {
  fmt: (v: number) => `${Math.round(v * 100)}%`,
  edit: (v: number) => String(Math.round(v * 100)),
  parse: (t: string) => Number(t.replace('%', '').trim()) / 100,
}

export function KvControls({
  lay,
  autoCenter,
  onLayout,
  onAutoCenter,
}: {
  lay: SizeLayout
  autoCenter: boolean
  onLayout: (patch: Partial<SizeLayout>) => void
  onAutoCenter: (v: boolean) => void
}) {
  return (
    <>
      <Row label="Position">
        <AlignGrid value={lay.kvAlign} onChange={(a) => onLayout({ kvAlign: a })} />
      </Row>
      <Slider label="KV size" min={0.3} max={5} step={0.02} value={lay.kvScale} onChange={(v) => onLayout({ kvScale: v })} {...pct} />
      <div className="grid grid-cols-2 gap-2">
        <Slider label="Offset X" min={-0.5} max={0.5} step={0.01} value={lay.kvDX ?? 0} onChange={(v) => onLayout({ kvDX: v })} {...pct} />
        <Slider label="Offset Y" min={-0.5} max={0.5} step={0.01} value={lay.kvDY ?? 0} onChange={(v) => onLayout({ kvDY: v })} {...pct} />
      </div>
      <Row label="Center on artwork">
        <input type="checkbox" checked={autoCenter} onChange={(e) => onAutoCenter(e.target.checked)} className="h-4 w-4 accent-accent" />
      </Row>
    </>
  )
}

export function LogoControls({ lay, onLayout }: { lay: SizeLayout; onLayout: (patch: Partial<SizeLayout>) => void }) {
  return (
    <>
      <LogoPresetBar value={lay.logoAlign} onChange={(a) => onLayout({ logoAlign: a })} />
      <Row label="Fine (9-point)">
        <AlignGrid value={lay.logoAlign} onChange={(a) => onLayout({ logoAlign: a })} />
      </Row>
      <Slider label="Logo size" min={0.1} max={3} step={0.02} value={lay.logoScale} onChange={(v) => onLayout({ logoScale: v })} {...pct} />
      <div className="grid grid-cols-2 gap-2">
        <Slider label="Offset X" min={-0.5} max={0.5} step={0.01} value={lay.logoDX ?? 0} onChange={(v) => onLayout({ logoDX: v })} {...pct} />
        <Slider label="Offset Y" min={-0.5} max={0.5} step={0.01} value={lay.logoDY ?? 0} onChange={(v) => onLayout({ logoDY: v })} {...pct} />
      </div>
    </>
  )
}

// ── shared widgets ───────────────────────────────────────────────────────────

// Quick logo-position bar (5 common spots).
const LOGO_PRESETS: { align: Align9; dot: [number, number] }[] = [
  { align: 'tc', dot: [0.5, 0.16] },
  { align: 'ml', dot: [0.18, 0.5] },
  { align: 'mc', dot: [0.5, 0.5] },
  { align: 'mr', dot: [0.82, 0.5] },
  { align: 'bc', dot: [0.5, 0.84] },
]

export function LogoPresetBar({ value, onChange }: { value: Align9; onChange: (a: Align9) => void }) {
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

export function AlignGrid({ value, onChange }: { value: Align9; onChange: (a: Align9) => void }) {
  return (
    <div className="grid grid-cols-3 gap-0.5 rounded-md bg-zinc-800/70 p-0.5">
      {ALIGN9.map((a) => {
        const active = value === a
        return (
          <button
            key={a}
            onClick={() => onChange(a)}
            className={`grid h-6 w-6 place-items-center rounded-[3px] transition ${active ? 'bg-accent' : 'hover:bg-zinc-700'}`}
          >
            <span className={`h-2 w-2 rounded-[1px] ${active ? 'bg-zinc-900' : 'bg-zinc-500'}`} />
          </button>
        )
      })}
    </div>
  )
}

export function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-zinc-400">{label}</span>
      {children}
    </div>
  )
}

export function Slider({
  label,
  min,
  max,
  step = 1,
  value,
  onChange,
  fmt,
  edit,
  parse,
}: {
  label: string
  min: number
  max: number
  step?: number
  value: number
  onChange: (v: number) => void
  fmt: (v: number) => string
  /** Formats the value for typing (no unit suffix). Defaults to the raw number. */
  edit?: (v: number) => string
  /** Parses typed text back to a stored value. Defaults to Number(). */
  parse?: (t: string) => number
}) {
  // While the field is focused it holds raw text so you can type freely; the
  // formatted value comes back on commit.
  const [draft, setDraft] = useState<string | null>(null)
  const frac = Math.max(0, Math.min(1, (value - min) / (max - min)))

  const commit = (raw: string) => {
    setDraft(null)
    const n = parse ? parse(raw) : Number(raw)
    if (!Number.isFinite(n)) return // unparseable → keep the previous value
    onChange(Math.max(min, Math.min(max, n)))
  }

  return (
    // A div, not a label: a label would forward stray clicks into the text field.
    <div className="relative flex h-9 select-none items-center justify-between overflow-hidden rounded-lg bg-zinc-800/50 px-3">
      <span className="pointer-events-none absolute inset-y-0 left-0 bg-zinc-700/45" style={{ width: `${frac * 100}%` }} />
      <span className="pointer-events-none relative z-10 text-xs text-zinc-300">{label}</span>
      {/* full-width invisible range: drag anywhere on the row */}
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="absolute inset-0 z-20 h-full w-full cursor-ew-resize opacity-0"
      />
      {/* the value, typeable — sits above the range so clicks land here */}
      <input
        type="text"
        inputMode="decimal"
        aria-label={`${label} value`}
        value={draft ?? fmt(value)}
        onFocus={(e) => {
          const el = e.currentTarget
          setDraft(edit ? edit(value) : String(value))
          requestAnimationFrame(() => el.select())
        }}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          else if (e.key === 'Escape') {
            setDraft(null)
            e.currentTarget.blur()
          }
        }}
        className="relative z-30 w-14 cursor-text rounded bg-transparent px-1 text-right text-xs tabular-nums text-zinc-100 outline-none focus:bg-zinc-900 focus:ring-1 focus:ring-accent"
      />
    </div>
  )
}
