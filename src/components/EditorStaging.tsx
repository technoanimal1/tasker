import { useEffect, useMemo, useRef, useState } from 'react'
import { useThumbnailsData } from '../hooks/useThumbnailsData'
import { useFigmaAssets } from '../hooks/useFigmaAssets'
import { FRAME_SIZES, frameSize } from '../lib/thumb'
import { computeOpaqueCenter, opaqueCenterCached, type Center } from '../lib/opaqueCenter'
import { LoadingScreen, Spinner } from './Spinner'
import { RotateCcw, Crosshair } from 'lucide-react'

/**
 * EDITOR STAGING — a clean-room rebuild of key-visual / logo placement.
 *
 * Deliberately attached to NOTHING: it owns its state, saves nothing, reads no
 * template, and shares no layout code with the live editors. It exists to get
 * "scale from the centre" provably right; once it is, the model moves into the
 * real Template editor.
 *
 * ── Why the old model drifted ──────────────────────────────────────────────
 * The live renderer RECOMPUTES a box per scale and then solves for the image's
 * top-left each frame:
 *      box  = anchorCenterBox(align, W, H, W*k, H*k)
 *      s    = min(box.w/nat.w, box.h/nat.h)      ← branch can FLIP as k changes
 *      left = box.x + box.w/2 - centroid.cx * (nat.w*s)
 * Three ways that slides sideways:
 *   1. `min()` picks width-fit or height-fit depending on how the BOX aspect
 *      compares to the IMAGE aspect. Any change to the box's aspect (or a
 *      width floor kicking in) flips the branch, and the fitted size jumps
 *      discontinuously — the art visibly lurches and appears to squash.
 *   2. The centroid arrives ASYNCHRONOUSLY (canvas alpha scan). Every frame
 *      before it resolves is laid out with 0.5/0.5, so the art hops once the
 *      real value lands — mid-drag that reads as drifting.
 *   3. left/top are re-derived from a scaled quantity each frame, so any error
 *      in the centroid is multiplied by the rendered size: the bigger you
 *      scale, the further off it sits. That is a drift proportional to k.
 *
 * ── The fix used here ──────────────────────────────────────────────────────
 * Never re-solve the position. Lay the image out ONCE at k = 1 (a plain
 * contain-fit inside the frame) with its chosen origin point sitting exactly on
 * the anchor, then let the GPU scale it:
 *      transform:        scale(k)
 *      transform-origin: <origin point of the image>
 * A CSS scale about a transform-origin holds that origin point perfectly still,
 * by definition, at every k. No per-frame arithmetic, no min() branch to flip,
 * no dependence on when the centroid resolves (changing the origin re-anchors
 * the layout, it does not accumulate error). The result cannot drift.
 */

type Anchor = 'center' | 'top' | 'bottom' | 'left' | 'right'

interface LayerCfg {
  scale: number
  dx: number
  dy: number
  anchor: Anchor
  /** Pin the artwork's visible centroid instead of the image's geometric centre. */
  autoCenter: boolean
}

const KV_DEFAULT: LayerCfg = { scale: 1, dx: 0, dy: 0, anchor: 'center', autoCenter: true }
const LOGO_DEFAULT: LayerCfg = { scale: 0.4, dx: 0, dy: 0.3, anchor: 'center', autoCenter: true }

const ANCHORS: { id: Anchor; label: string; p: [number, number] }[] = [
  { id: 'top', label: 'Top', p: [0.5, 0.28] },
  { id: 'left', label: 'Left', p: [0.28, 0.5] },
  { id: 'center', label: 'Center', p: [0.5, 0.5] },
  { id: 'right', label: 'Right', p: [0.72, 0.5] },
  { id: 'bottom', label: 'Bottom', p: [0.5, 0.72] },
]

const anchorPoint = (a: Anchor): [number, number] => ANCHORS.find((x) => x.id === a)?.p ?? [0.5, 0.5]

export function EditorStaging() {
  const { pageItems, loadPage, pageLoading } = useThumbnailsData()
  const { assetsFor, ensureResolved } = useFigmaAssets(pageItems)

  const [sizeKey, setSizeKey] = useState('3:4')
  const [idx, setIdx] = useState(0)
  const [kv, setKv] = useState<LayerCfg>(KV_DEFAULT)
  const [logo, setLogo] = useState<LayerCfg>(LOGO_DEFAULT)
  const [debug, setDebug] = useState(true)
  const [showBg, setShowBg] = useState(true)
  const [vw, setVw] = useState(() => (typeof window !== 'undefined' ? window.innerWidth : 1200))

  useEffect(() => {
    loadPage(0, 24)
  }, [loadPage])
  useEffect(() => {
    const onR = () => setVw(window.innerWidth)
    window.addEventListener('resize', onR)
    return () => window.removeEventListener('resize', onR)
  }, [])

  const sample = pageItems[idx] ?? pageItems[0] ?? null
  useEffect(() => {
    if (sample) ensureResolved(sample)
  }, [sample, ensureResolved])

  const assets = sample ? assetsFor(sample) : null
  const size = frameSize(sizeKey)
  const previewW = Math.min(vw >= 1024 ? 420 : vw - 64, Math.round(size.w * (520 / size.h)))

  const resetAll = () => {
    setKv(KV_DEFAULT)
    setLogo(LOGO_DEFAULT)
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">
            Editor staging <span className="ml-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-400">sandbox</span>
          </h1>
          <p className="text-sm text-zinc-400">
            Clean-room key-visual &amp; logo scaling. Saves nothing and reads no template — everything here starts from scratch.
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setDebug((d) => !d)}
            title="Show the anchor crosshair and layer bounds"
            className={`flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition ${
              debug ? 'border-accent bg-accent/15 text-accent' : 'border-zinc-700 text-zinc-200 hover:bg-zinc-800'
            }`}
          >
            <Crosshair size={15} /> Guides
          </button>
          <button
            onClick={resetAll}
            className="flex h-9 items-center gap-1.5 rounded-lg border border-zinc-700 px-3 text-xs font-medium text-zinc-200 transition hover:bg-zinc-800"
          >
            <RotateCcw size={15} /> Reset
          </button>
        </div>
      </div>

      {/* aspect + sample pickers */}
      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        {FRAME_SIZES.map((s) => (
          <button
            key={s.key}
            onClick={() => setSizeKey(s.key)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
              sizeKey === s.key ? 'bg-accent text-zinc-900' : 'bg-zinc-800/70 text-zinc-300 hover:bg-zinc-700'
            }`}
          >
            {s.key}
          </button>
        ))}
        {pageItems.length > 1 && (
          <select
            value={idx}
            onChange={(e) => setIdx(Number(e.target.value))}
            className="ml-auto max-w-[220px] rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-xs outline-none focus:border-accent"
          >
            {pageItems.map((t, i) => (
              <option key={t.id} value={i}>
                {t.name}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div
          className="sticky top-2 z-20 flex items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-950/85 p-3 backdrop-blur lg:static lg:min-h-[560px] lg:bg-transparent lg:p-8 lg:backdrop-blur-0"
          style={{ backgroundImage: 'radial-gradient(circle at center, #1a1c22 1px, transparent 1px)', backgroundSize: '22px 22px' }}
        >
          {assets ? (
            <StageCard
              sizeKey={sizeKey}
              displayW={previewW}
              bg={showBg ? assets.bg : null}
              kvSrc={assets.kv}
              logoSrc={assets.logoColor ?? assets.logoWhite}
              kv={kv}
              logo={logo}
              debug={debug}
            />
          ) : pageLoading ? (
            <div className="flex items-center gap-2 text-sm text-zinc-500">
              <Spinner size={18} /> Loading a sample game…
            </div>
          ) : (
            <LoadingScreen label="Loading…" />
          )}
        </div>

        <aside className="flex flex-col gap-4 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-3">
          <LayerPanel title="Key visual" cfg={kv} onChange={setKv} scaleMax={4} />
          <LayerPanel title="Logo" cfg={logo} onChange={setLogo} scaleMax={2} />
          <label className="flex items-center justify-between text-xs text-zinc-400">
            Show background
            <input type="checkbox" checked={showBg} onChange={(e) => setShowBg(e.target.checked)} className="h-4 w-4 accent-accent" />
          </label>
          <p className="text-[11px] leading-relaxed text-zinc-500">
            Scaling uses a GPU transform about a fixed origin, so the pinned point cannot move at any size. Turn on
            <b> Guides</b>: the crosshair is the anchor — it must stay welded to the same spot in the artwork as you drag Size.
          </p>
        </aside>
      </div>
    </div>
  )
}

/** One layer's controls. */
function LayerPanel({
  title,
  cfg,
  onChange,
  scaleMax,
}: {
  title: string
  cfg: LayerCfg
  onChange: (c: LayerCfg) => void
  scaleMax: number
}) {
  const set = (patch: Partial<LayerCfg>) => onChange({ ...cfg, ...patch })
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold text-zinc-300">{title}</p>
        <button
          onClick={() => set({ dx: 0, dy: 0 })}
          className="text-[11px] text-zinc-500 underline hover:text-zinc-300"
          title="Recentre this layer (clears the offsets)"
        >
          recentre
        </button>
      </div>
      <div className="flex gap-1">
        {ANCHORS.map((a) => (
          <button
            key={a.id}
            onClick={() => set({ anchor: a.id })}
            title={a.label}
            className={`flex-1 rounded-md border py-1.5 text-[10px] font-medium transition ${
              cfg.anchor === a.id ? 'border-accent bg-accent/10 text-accent' : 'border-zinc-700 text-zinc-400 hover:bg-zinc-800'
            }`}
          >
            {a.label}
          </button>
        ))}
      </div>
      <Slider label="Size" min={0.1} max={scaleMax} step={0.01} value={cfg.scale} onChange={(v) => set({ scale: v })} fmt={(v) => `${Math.round(v * 100)}%`} />
      <div className="grid grid-cols-2 gap-2">
        <Slider label="Offset X" min={-0.5} max={0.5} step={0.005} value={cfg.dx} onChange={(v) => set({ dx: v })} fmt={(v) => `${Math.round(v * 100)}%`} />
        <Slider label="Offset Y" min={-0.5} max={0.5} step={0.005} value={cfg.dy} onChange={(v) => set({ dy: v })} fmt={(v) => `${Math.round(v * 100)}%`} />
      </div>
      <label className="flex items-center justify-between text-xs text-zinc-400">
        Pin visible artwork
        <input type="checkbox" checked={cfg.autoCenter} onChange={(e) => set({ autoCenter: e.target.checked })} className="h-4 w-4 accent-accent" />
      </label>
    </div>
  )
}

/** The staging frame: background + KV + logo, drawn with transform scaling. */
function StageCard({
  sizeKey,
  displayW,
  bg,
  kvSrc,
  logoSrc,
  kv,
  logo,
  debug,
}: {
  sizeKey: string
  displayW: number
  bg?: string | null
  kvSrc?: string | null
  logoSrc?: string | null
  kv: LayerCfg
  logo: LayerCfg
  debug: boolean
}) {
  const { w: W, h: H } = frameSize(sizeKey)
  const view = displayW / W

  return (
    <div style={{ width: W * view, height: H * view }} className="shadow-2xl">
      <div
        style={{
          position: 'relative',
          width: W,
          height: H,
          transform: `scale(${view})`,
          transformOrigin: 'top left',
          borderRadius: 16,
          overflow: 'hidden',
          background: '#0a0f0c',
        }}
      >
        {bg && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              backgroundImage: `url("${bg}")`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }}
          />
        )}
        {kvSrc && <StageLayer src={kvSrc} cfg={kv} W={W} H={H} debug={debug} hue="#38bdf8" />}
        {logoSrc && <StageLayer src={logoSrc} cfg={logo} W={W} H={H} debug={debug} hue="#f472b6" />}
        {debug && (
          <>
            {/* frame centre reference */}
            <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: 'rgba(255,255,255,0.25)' }} />
            <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 1, background: 'rgba(255,255,255,0.25)' }} />
          </>
        )}
      </div>
    </div>
  )
}

/**
 * A single image layer. Laid out once at scale 1 with its origin point sitting
 * on the anchor, then scaled by a CSS transform about that same origin — which
 * pins the point exactly, at every size, with no per-frame math.
 */
function StageLayer({
  src,
  cfg,
  W,
  H,
  debug,
  hue,
}: {
  src: string
  cfg: LayerCfg
  W: number
  H: number
  debug: boolean
  hue: string
}) {
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null)
  const [ctr, setCtr] = useState<Center>(opaqueCenterCached(src) ?? { cx: 0.5, cy: 0.5 })
  const live = useRef(true)

  useEffect(() => {
    live.current = true
    setNat(null)
    setCtr(opaqueCenterCached(src) ?? { cx: 0.5, cy: 0.5 })
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => live.current && setNat({ w: img.naturalWidth, h: img.naturalHeight })
    img.src = src
    if (!opaqueCenterCached(src)) computeOpaqueCenter(src).then((c) => live.current && setCtr(c))
    return () => {
      live.current = false
    }
  }, [src])

  const geom = useMemo(() => {
    if (!nat) return null
    // Base (k = 1) size: a plain contain-fit of the image inside the frame.
    // Computed from the IMAGE and the FRAME only — never from the scale — so
    // there is no branch that can flip as the size changes.
    const fit = Math.min(W / nat.w, H / nat.h)
    const baseW = nat.w * fit
    const baseH = nat.h * fit
    // Origin: the point of the image that must stay put.
    const ox = cfg.autoCenter ? ctr.cx : 0.5
    const oy = cfg.autoCenter ? ctr.cy : 0.5
    // Anchor: where that point sits in the frame.
    const [axf, ayf] = anchorPoint(cfg.anchor)
    const ax = (axf + cfg.dx) * W
    const ay = (ayf + cfg.dy) * H
    return { baseW, baseH, ox, oy, left: ax - ox * baseW, top: ay - oy * baseH, ax, ay }
  }, [nat, ctr, cfg.autoCenter, cfg.anchor, cfg.dx, cfg.dy, W, H])

  if (!geom) return null

  return (
    <>
      <img
        src={src}
        draggable={false}
        decoding="async"
        style={{
          position: 'absolute',
          left: geom.left,
          top: geom.top,
          width: geom.baseW,
          height: geom.baseH,
          transform: `scale(${cfg.scale})`,
          // Scaling about the pinned point is what makes it immovable.
          transformOrigin: `${geom.ox * 100}% ${geom.oy * 100}%`,
          outline: debug ? `2px dashed ${hue}` : undefined,
          outlineOffset: 0,
        }}
      />
      {debug && (
        <div
          style={{
            position: 'absolute',
            left: geom.ax,
            top: geom.ay,
            width: 0,
            height: 0,
            pointerEvents: 'none',
          }}
        >
          <div style={{ position: 'absolute', left: -22, top: -1, width: 44, height: 2, background: hue }} />
          <div style={{ position: 'absolute', top: -22, left: -1, height: 44, width: 2, background: hue }} />
        </div>
      )}
    </>
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
