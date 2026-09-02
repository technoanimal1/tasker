import { useState } from 'react'
import type { useBranches } from '../hooks/useBranches'
import type { Branch } from '../lib/types'

interface Props {
  api: ReturnType<typeof useBranches>
  activeBranch: Branch | null
  onSelect: (id: string) => void
}

export function BranchMenu({ api, activeBranch, onSelect }: Props) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'none' | 'create' | 'fork'>('none')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit() {
    if (!name.trim()) return
    setBusy(true)
    try {
      let created: Branch
      if (mode === 'fork' && activeBranch) {
        created = await api.fork(activeBranch, name.trim())
      } else {
        created = await api.create(name.trim())
      }
      onSelect(created.id)
      setName('')
      setMode('none')
      setOpen(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-lg border border-ring bg-panel/70 px-3 py-1.5 text-sm transition hover:border-white/[0.16]"
      >
        <span className="text-accent">⑂</span>
        <span className="max-w-[160px] truncate font-medium text-white">{activeBranch?.name ?? 'branch'}</span>
        <span className={`text-dim transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 z-20 mt-2 w-72 rounded-2xl border border-ring bg-[#111214] p-2 shadow-2xl">
            <div className="max-h-64 overflow-y-auto">
              {api.branches.map((b) => (
                <button
                  key={b.id}
                  onClick={() => {
                    onSelect(b.id)
                    setOpen(false)
                  }}
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition ${
                    activeBranch?.id === b.id ? 'bg-white/[0.06] ring-1 ring-white/[0.16]' : 'hover:bg-white/[0.06]'
                  }`}
                >
                  <span className="truncate">
                    {b.name}
                    {b.is_default && <span className="ml-2 text-xs text-dim">default</span>}
                  </span>
                  {activeBranch?.id === b.id && <span className="text-accent">✓</span>}
                </button>
              ))}
            </div>

            <div className="mt-2 border-t border-ring pt-2">
              {mode === 'none' ? (
                <div className="flex gap-2">
                  <button
                    onClick={() => setMode('create')}
                    className="flex-1 rounded-lg bg-white/[0.06] px-3 py-1.5 text-sm hover:bg-white/[0.12]"
                  >
                    + New
                  </button>
                  <button
                    onClick={() => setMode('fork')}
                    disabled={!activeBranch}
                    className="flex-1 rounded-lg bg-white/[0.06] px-3 py-1.5 text-sm hover:bg-white/[0.12] disabled:opacity-50"
                  >
                    ⑂ Fork current
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="px-1 text-xs text-muted">
                    {mode === 'fork'
                      ? `Fork "${activeBranch?.name}" — copies its frames, shares brand assets`
                      : 'New empty branch'}
                  </p>
                  <input
                    autoFocus
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && submit()}
                    placeholder="branch name (e.g. client-acme)"
                    className="w-full rounded-lg border border-white/[0.16] bg-deep px-3 py-1.5 text-sm outline-none focus:border-accent"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={submit}
                      disabled={busy || !name.trim()}
                      className="flex-1 rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-black hover:bg-yellow disabled:opacity-60"
                    >
                      {busy ? '…' : mode === 'fork' ? 'Fork' : 'Create'}
                    </button>
                    <button
                      onClick={() => {
                        setMode('none')
                        setName('')
                      }}
                      className="rounded-lg border border-white/[0.16] px-3 py-1.5 text-sm"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
