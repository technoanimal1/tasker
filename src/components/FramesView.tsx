import { useMemo, useState } from 'react'
import type { Branch } from '../lib/types'
import type { useBrandAssets } from '../hooks/useBrandAssets'
import { useFrames } from '../hooks/useFrames'
import { FrameRender } from './FrameRender'
import { FrameBuilder } from './FrameBuilder'

interface Props {
  branch: Branch
  assets: ReturnType<typeof useBrandAssets>
}

const SIZE_PRESETS = [
  { label: 'OG / Link (1200×630)', w: 1200, h: 630 },
  { label: 'Square (1080×1080)', w: 1080, h: 1080 },
  { label: 'Story (1080×1920)', w: 1080, h: 1920 },
  { label: 'Banner (1200×400)', w: 1200, h: 400 },
]

export function FramesView({ branch, assets }: Props) {
  const framesApi = useFrames(branch.id)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [preset, setPreset] = useState(0)
  const [busy, setBusy] = useState(false)

  const resolve = useMemo(
    () => (kind: Parameters<typeof assets.byKind>[0]) => assets.byKind(kind)?.url ?? null,
    [assets],
  )

  const editing = framesApi.frames.find((f) => f.id === editingId) ?? null

  if (editing) {
    return (
      <FrameBuilder
        frame={editing}
        assets={assets}
        onSave={(patch) => framesApi.save(editing.id, patch)}
        onClose={() => setEditingId(null)}
      />
    )
  }

  async function createFrame() {
    if (!name.trim()) return
    setBusy(true)
    try {
      const size = SIZE_PRESETS[preset]
      const f = await framesApi.create({
        name: name.trim(),
        width: size.w,
        height: size.h,
        background_color: '#0b1020',
      })
      setName('')
      setCreating(false)
      setEditingId(f.id)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">
            Frames <span className="text-slate-500">· {branch.name}</span>
          </h1>
          <p className="text-sm text-slate-400">
            Designs on this branch. Brand assets are shared; layouts are per branch.
          </p>
        </div>
        <button
          onClick={() => setCreating((v) => !v)}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-zinc-900 hover:bg-brand-dark"
        >
          ＋ New frame
        </button>
      </div>

      {creating && (
        <div className="mb-6 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1">
              <label className="mb-1 block text-xs text-slate-400">Name</label>
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && createFrame()}
                placeholder="e.g. Acme — hero"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-brand"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-400">Size</label>
              <select
                value={preset}
                onChange={(e) => setPreset(Number(e.target.value))}
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-brand"
              >
                {SIZE_PRESETS.map((p, i) => (
                  <option key={p.label} value={i}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={createFrame}
              disabled={busy || !name.trim()}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-zinc-900 hover:bg-brand-dark disabled:opacity-60"
            >
              {busy ? '…' : 'Create & edit'}
            </button>
          </div>
        </div>
      )}

      {framesApi.loading ? (
        <div className="py-20 text-center text-slate-500">Loading frames…</div>
      ) : framesApi.frames.length === 0 ? (
        <div className="grid place-items-center rounded-xl border border-dashed border-slate-800 py-20 text-slate-500">
          No frames yet on this branch. Create one to start designing.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {framesApi.frames.map((f) => {
            const scale = 260 / f.width
            return (
              <div
                key={f.id}
                className="group overflow-hidden rounded-xl border border-slate-800 bg-slate-900/60"
              >
                <button
                  onClick={() => setEditingId(f.id)}
                  className="checker block w-full"
                  title="Edit frame"
                >
                  <FrameRender frame={f} resolve={resolve} scale={scale} />
                </button>
                <div className="flex items-center justify-between gap-2 p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium" title={f.name}>
                      {f.name}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {f.width}×{f.height}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button
                      onClick={() => setEditingId(f.id)}
                      className="rounded-md bg-slate-800 px-2 py-1 text-xs hover:bg-slate-700"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`Delete frame "${f.name}"?`)) framesApi.remove(f.id)
                      }}
                      className="rounded-md bg-slate-800 px-2 py-1 text-xs text-red-300 hover:bg-slate-700"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
