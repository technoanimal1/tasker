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
        className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/70 px-3 py-1.5 text-sm transition hover:border-zinc-700"
      >
        <span className="text-accent">⑂</span>
        <span className="max-w-[160px] truncate font-medium text-zinc-100">{activeBranch?.name ?? 'branch'}</span>
        <span className={`text-zinc-500 transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 z-20 mt-2 w-72 rounded-2xl border border-zinc-800 bg-[#111214] p-2 shadow-2xl">
            <div className="max-h-64 overflow-y-auto">
              {api.branches.map((b) => (
                <button
                  key={b.id}
                  onClick={() => {
                    onSelect(b.id)
                    setOpen(false)
                  }}
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition ${
                    activeBranch?.id === b.id ? 'bg-zinc-800 ring-1 ring-zinc-700' : 'hover:bg-zinc-800/50'
                  }`}
                >
                  <span className="truncate">
                    {b.name}
                    {b.is_default && <span className="ml-2 text-xs text-zinc-500">default</span>}
                  </span>
                  {activeBranch?.id === b.id && <span className="text-accent">✓</span>}
                </button>
              ))}
            </div>

            <div className="mt-2 border-t border-zinc-800 pt-2">
              {mode === 'none' ? (
                <div className="flex gap-2">
                  <button
                    onClick={() => setMode('create')}
                    className="flex-1 rounded-lg bg-zinc-800 px-3 py-1.5 text-sm hover:bg-zinc-700"
                  >
                    ＋ New
                  </button>
                  <button
                    onClick={() => setMode('fork')}
                    disabled={!activeBranch}
                    className="flex-1 rounded-lg bg-zinc-800 px-3 py-1.5 text-sm hover:bg-zinc-700 disabled:opacity-50"
                  >
                    ⑂ Fork current
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="px-1 text-xs text-zinc-400">
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
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-sm outline-none focus:border-accent"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={submit}
                      disabled={busy || !name.trim()}
                      className="flex-1 rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-zinc-900 hover:bg-accent-dark disabled:opacity-60"
                    >
                      {busy ? '…' : mode === 'fork' ? 'Fork' : 'Create'}
                    </button>
                    <button
                      onClick={() => {
                        setMode('none')
                        setName('')
                      }}
                      className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm"
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
