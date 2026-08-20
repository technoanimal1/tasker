import { useEffect, useMemo, useRef, useState } from 'react'
import type { AssetKind, Frame, Layer, LayerType } from '../lib/types'
import type { useBrandAssets } from '../hooks/useBrandAssets'
import { LayerContent, layerPositionStyle } from './FrameRender'
import { exportFramePng } from '../lib/exportPng'

interface Props {
  frame: Frame
  assets: ReturnType<typeof useBrandAssets>
  onSave: (patch: Partial<Frame>) => Promise<void>
  onClose: () => void
}

const MAX_W = 760
const MAX_H = 560

let uid = 0
function newId() {
  // crypto.randomUUID isn't guaranteed in every context; fall back to a counter.
  try {
    return crypto.randomUUID()
  } catch {
    uid += 1
    return `l_${Date.now()}_${uid}`
  }
}

export function FrameBuilder({ frame, assets, onSave, onClose }: Props) {
  const [name, setName] = useState(frame.name)
  const [width, setWidth] = useState(frame.width)
  const [height, setHeight] = useState(frame.height)
  const [bg, setBg] = useState(frame.background_color)
  const [layers, setLayers] = useState<Layer[]>(frame.layout ?? [])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [exporting, setExporting] = useState(false)

  const resolve = useMemo(
    () => (kind: AssetKind) => assets.byKind(kind)?.url ?? null,
    [assets],
  )

  const scale = Math.min(MAX_W / width, MAX_H / height, 1)
  const selected = layers.find((l) => l.id === selectedId) ?? null
  const sorted = useMemo(() => [...layers].sort((a, b) => a.z - b.z), [layers])

  function touch<T>(v: T): T {
    setDirty(true)
    return v
  }

  function updateLayer(id: string, patch: Partial<Layer>) {
    setLayers((ls) => touch(ls.map((l) => (l.id === id ? { ...l, ...patch } : l))))
  }

  function addLayer(type: LayerType, assetKind?: AssetKind) {
    const z = layers.reduce((m, l) => Math.max(m, l.z), 0) + 1
    const base: Layer = {
      id: newId(),
      type,
      name:
        type === 'asset' ? (assetKind as string) : type === 'text' ? 'Text' : 'Rectangle',
      x: 40,
      y: 40,
      w: 300,
      h: 160,
      rotation: 0,
      opacity: 1,
      z,
    }
    if (type === 'asset' && assetKind === 'background') {
      Object.assign(base, { x: 0, y: 0, w: width, h: height, assetKind })
    } else if (type === 'asset' && assetKind === 'key_visual') {
      Object.assign(base, {
        assetKind,
        w: Math.round(width * 0.5),
        h: Math.round(height * 0.5),
        x: Math.round(width * 0.25),
        y: Math.round(height * 0.25),
      })
    } else if (type === 'asset' && assetKind === 'logo') {
      Object.assign(base, { assetKind, w: 220, h: 80, x: 40, y: 40 })
    } else if (type === 'text') {
      Object.assign(base, {
        w: 480,
        h: 90,
        text: 'Your headline',
        fontSize: 56,
        fontFamily: 'Inter, system-ui, sans-serif',
        fontWeight: 700,
        color: '#ffffff',
        align: 'left' as const,
      })
    } else if (type === 'rect') {
      Object.assign(base, { fill: '#6d5efc', radius: 16 })
    }
    setLayers((ls) => touch([...ls, base]))
    setSelectedId(base.id)
  }

  function removeLayer(id: string) {
    setLayers((ls) => touch(ls.filter((l) => l.id !== id)))
    if (selectedId === id) setSelectedId(null)
  }

  function reorder(id: string, dir: 'up' | 'down') {
    setLayers((ls) => {
      const s = [...ls].sort((a, b) => a.z - b.z)
      const i = s.findIndex((l) => l.id === id)
      const j = dir === 'up' ? i + 1 : i - 1
      if (i < 0 || j < 0 || j >= s.length) return ls
      const zi = s[i].z
      s[i] = { ...s[i], z: s[j].z }
      s[j] = { ...s[j], z: zi }
      return touch(s)
    })
  }

  // ---- dragging / resizing ----
  const dragRef = useRef<
    | null
    | {
        mode: 'move' | 'resize'
        id: string
        startX: number
        startY: number
        ox: number
        oy: number
        ow: number
        oh: number
      }
  >(null)

  useEffect(() => {
    function onMove(e: PointerEvent) {
      const d = dragRef.current
      if (!d) return
      const dx = (e.clientX - d.startX) / scale
      const dy = (e.clientY - d.startY) / scale
      if (d.mode === 'move') {
        updateLayer(d.id, { x: Math.round(d.ox + dx), y: Math.round(d.oy + dy) })
      } else {
        updateLayer(d.id, {
          w: Math.max(8, Math.round(d.ow + dx)),
          h: Math.max(8, Math.round(d.oh + dy)),
        })
      }
    }
    function onUp() {
      dragRef.current = null
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scale])

  function startDrag(e: React.PointerEvent, l: Layer, mode: 'move' | 'resize') {
    e.stopPropagation()
    setSelectedId(l.id)
    dragRef.current = {
      mode,
      id: l.id,
      startX: e.clientX,
      startY: e.clientY,
      ox: l.x,
      oy: l.y,
      ow: l.w,
      oh: l.h,
    }
  }

  // Delete selected via keyboard.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        const tag = (e.target as HTMLElement)?.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
        e.preventDefault()
        removeLayer(selectedId)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId])

  async function handleSave() {
    setSaving(true)
    try {
      await onSave({ name, width, height, background_color: bg, layout: layers })
      setDirty(false)
    } finally {
      setSaving(false)
    }
  }

  async function handleExport() {
    setExporting(true)
    try {
      await exportFramePng(
        { ...frame, name, width, height, background_color: bg, layout: layers },
        resolve,
      )
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Export failed')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div>
      {/* Toolbar */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm hover:bg-slate-800"
          >
            ← Frames
          </button>
          <input
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              setDirty(true)
            }}
            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm font-medium outline-none focus:border-brand"
          />
          <span className="text-xs text-slate-500">
            {width}×{height}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {dirty && <span className="text-xs text-amber-400">unsaved</span>}
          <button
            onClick={handleExport}
            disabled={exporting}
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm hover:bg-slate-800 disabled:opacity-60"
          >
            {exporting ? 'Exporting…' : 'Export PNG'}
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !dirty}
            className="rounded-lg bg-brand px-4 py-1.5 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[190px_1fr_260px]">
        {/* Left: add layers */}
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Add layer</p>
          <ToolButton label="Background" hint="shared asset" onClick={() => addLayer('asset', 'background')} />
          <ToolButton label="Key visual" hint="shared asset" onClick={() => addLayer('asset', 'key_visual')} />
          <ToolButton label="Logotype" hint="shared asset" onClick={() => addLayer('asset', 'logo')} />
          <ToolButton label="Text" onClick={() => addLayer('text')} />
          <ToolButton label="Rectangle" onClick={() => addLayer('rect')} />

          <div className="grid grid-cols-2 gap-2 pt-2">
            <label className="block">
              <span className="mb-1 block text-xs text-slate-500">Canvas W</span>
              <input
                type="number"
                value={width}
                onChange={(e) => {
                  setWidth(Math.max(1, Number(e.target.value)))
                  setDirty(true)
                }}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-sm outline-none focus:border-brand"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-slate-500">Canvas H</span>
              <input
                type="number"
                value={height}
                onChange={(e) => {
                  setHeight(Math.max(1, Number(e.target.value)))
                  setDirty(true)
                }}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-sm outline-none focus:border-brand"
              />
            </label>
          </div>

          <div className="pt-2">
            <label className="mb-1 block text-xs text-slate-500">Canvas background</label>
            <input
              type="color"
              value={bg}
              onChange={(e) => {
                setBg(e.target.value)
                setDirty(true)
              }}
              className="h-8 w-full cursor-pointer rounded border border-slate-700 bg-slate-950"
            />
          </div>
        </div>

        {/* Center: canvas */}
        <div className="overflow-auto rounded-xl border border-slate-800 bg-slate-950/60 p-6">
          <div
            className="checker relative mx-auto shadow-2xl"
            style={{ width: width * scale, height: height * scale }}
            onPointerDown={() => setSelectedId(null)}
          >
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width,
                height,
                background: bg,
                transform: `scale(${scale})`,
                transformOrigin: 'top left',
              }}
            >
              {sorted.map((l) => {
                const isSel = l.id === selectedId
                return (
                  <div
                    key={l.id}
                    style={{ ...layerPositionStyle(l), cursor: 'move' }}
                    onPointerDown={(e) => startDrag(e, l, 'move')}
                  >
                    <div
                      style={{ width: '100%', height: '100%' }}
                      className={isSel ? 'outline outline-2 outline-brand' : ''}
                    >
                      <LayerContent
                        layer={l}
                        assetUrl={l.type === 'asset' && l.assetKind ? resolve(l.assetKind) : null}
                      />
                    </div>
                    {isSel && (
                      <div
                        onPointerDown={(e) => startDrag(e, l, 'resize')}
                        style={{
                          position: 'absolute',
                          right: -6,
                          bottom: -6,
                          width: 12,
                          height: 12,
                          cursor: 'nwse-resize',
                        }}
                        className="rounded-sm border border-white bg-brand"
                      />
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Right: layers + properties */}
        <div className="space-y-4">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Layers
            </p>
            <div className="space-y-1">
              {sorted
                .slice()
                .reverse()
                .map((l) => (
                  <div
                    key={l.id}
                    onClick={() => setSelectedId(l.id)}
                    className={`flex cursor-pointer items-center justify-between rounded-lg px-2 py-1.5 text-sm ${
                      l.id === selectedId ? 'bg-slate-800' : 'hover:bg-slate-900'
                    }`}
                  >
                    <span className="truncate">
                      <span className="mr-1 text-slate-500">
                        {l.type === 'asset' ? '▤' : l.type === 'text' ? 'T' : '▭'}
                      </span>
                      {l.name}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-slate-500">
                      <button onClick={(e) => { e.stopPropagation(); reorder(l.id, 'up') }} title="Forward">↑</button>
                      <button onClick={(e) => { e.stopPropagation(); reorder(l.id, 'down') }} title="Back">↓</button>
                      <button
                        onClick={(e) => { e.stopPropagation(); removeLayer(l.id) }}
                        className="text-red-300"
                        title="Delete"
                      >
                        ✕
                      </button>
                    </span>
                  </div>
                ))}
              {layers.length === 0 && (
                <p className="px-2 py-4 text-center text-xs text-slate-600">No layers yet</p>
              )}
            </div>
          </div>

          {selected && (
            <PropertiesPanel layer={selected} onChange={(patch) => updateLayer(selected.id, patch)} />
          )}
        </div>
      </div>
    </div>
  )
}

function ToolButton({ label, hint, onClick }: { label: string; hint?: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center justify-between rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-left text-sm hover:border-slate-700 hover:bg-slate-800"
    >
      <span>{label}</span>
      {hint && <span className="text-[10px] text-slate-500">{hint}</span>}
    </button>
  )
}

function PropertiesPanel({
  layer,
  onChange,
}: {
  layer: Layer
  onChange: (patch: Partial<Layer>) => void
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
        {layer.type} properties
      </p>

      <div className="grid grid-cols-2 gap-2">
        <Num label="X" value={layer.x} onChange={(v) => onChange({ x: v })} />
        <Num label="Y" value={layer.y} onChange={(v) => onChange({ y: v })} />
        <Num label="W" value={layer.w} onChange={(v) => onChange({ w: v })} />
        <Num label="H" value={layer.h} onChange={(v) => onChange({ h: v })} />
        <Num label="Rotation" value={layer.rotation} onChange={(v) => onChange({ rotation: v })} />
        <Num
          label="Opacity %"
          value={Math.round(layer.opacity * 100)}
          onChange={(v) => onChange({ opacity: Math.min(1, Math.max(0, v / 100)) })}
        />
      </div>

      {layer.type === 'text' && (
        <div className="mt-3 space-y-2 border-t border-slate-800 pt-3">
          <div>
            <label className="mb-1 block text-[11px] text-slate-500">Text</label>
            <textarea
              value={layer.text ?? ''}
              onChange={(e) => onChange({ text: e.target.value })}
              rows={2}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm outline-none focus:border-brand"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Num label="Font size" value={layer.fontSize ?? 32} onChange={(v) => onChange({ fontSize: v })} />
            <Num label="Weight" value={layer.fontWeight ?? 400} onChange={(v) => onChange({ fontWeight: v })} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-[11px] text-slate-500">Color</label>
              <input
                type="color"
                value={layer.color ?? '#ffffff'}
                onChange={(e) => onChange({ color: e.target.value })}
                className="h-8 w-full cursor-pointer rounded border border-slate-700 bg-slate-950"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] text-slate-500">Align</label>
              <select
                value={layer.align ?? 'left'}
                onChange={(e) => onChange({ align: e.target.value as Layer['align'] })}
                className="h-8 w-full rounded border border-slate-700 bg-slate-950 px-2 text-sm outline-none focus:border-brand"
              >
                <option value="left">Left</option>
                <option value="center">Center</option>
                <option value="right">Right</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {layer.type === 'rect' && (
        <div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-800 pt-3">
          <div>
            <label className="mb-1 block text-[11px] text-slate-500">Fill</label>
            <input
              type="color"
              value={layer.fill ?? '#6d5efc'}
              onChange={(e) => onChange({ fill: e.target.value })}
              className="h-8 w-full cursor-pointer rounded border border-slate-700 bg-slate-950"
            />
          </div>
          <Num label="Radius" value={layer.radius ?? 0} onChange={(v) => onChange({ radius: v })} />
        </div>
      )}

      {layer.type === 'asset' && (
        <p className="mt-3 border-t border-slate-800 pt-3 text-[11px] text-slate-500">
          Shows the shared <b>{layer.assetKind}</b> asset. Update it in Brand assets to change it
          across every frame.
        </p>
      )}
    </div>
  )
}

function Num({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (v: number) => void
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] text-slate-500">{label}</span>
      <input
        type="number"
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-sm outline-none focus:border-brand"
      />
    </label>
  )
}
