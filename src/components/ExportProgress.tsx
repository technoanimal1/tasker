import { useState } from 'react'
import { Download, Check, X, Loader2, Circle } from 'lucide-react'

export type ExportStatus = 'pending' | 'active' | 'done' | 'error'

export interface ExportJob {
  id: string
  name: string
  format: string // PNG / WEBP / AVIF / WEBM
  status: ExportStatus
  size?: number // bytes, once done
  error?: string
}

type Filter = 'all' | 'completed' | 'failed'

function fmtSize(bytes?: number) {
  if (!bytes) return ''
  const mb = bytes / (1024 * 1024)
  if (mb >= 1) return `${mb.toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

export function ExportProgress({
  open,
  jobs,
  onClose,
  onCancel,
}: {
  open: boolean
  jobs: ExportJob[]
  onClose: () => void
  onCancel: () => void
}) {
  const [filter, setFilter] = useState<Filter>('all')
  const [collapsed, setCollapsed] = useState(false)
  if (!open) return null

  const done = jobs.filter((j) => j.status === 'done').length
  const failed = jobs.filter((j) => j.status === 'error').length
  const active = jobs.find((j) => j.status === 'active')
  const total = jobs.length
  const running = jobs.some((j) => j.status === 'active' || j.status === 'pending')
  const shown = jobs.filter((j) =>
    filter === 'completed' ? j.status === 'done' : filter === 'failed' ? j.status === 'error' : true,
  )
  const pct = total ? Math.round(((done + failed) / total) * 100) : 0

  const chips: { key: Filter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'completed', label: `Completed` },
    { key: 'failed', label: 'Failed' },
  ]

  return (
    <div className="fixed bottom-4 right-4 z-50 w-[min(94vw,420px)] overflow-hidden rounded-2xl border border-ring bg-[#111214] shadow-2xl">
      {/* header */}
      <div className="flex items-center justify-between px-4 pt-4">
        <span className="text-base font-semibold text-white">Exports</span>
        <div className="flex items-center gap-2">
          {running ? (
            <button
              onClick={onCancel}
              className="rounded-lg border border-white/[0.16] px-3 py-1.5 text-xs font-medium text-white hover:bg-white/[0.06]"
            >
              Cancel all
            </button>
          ) : (
            <button
              onClick={onClose}
              className="rounded-lg border border-white/[0.16] px-3 py-1.5 text-xs font-medium text-white hover:bg-white/[0.06]"
            >
              Close
            </button>
          )}
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-white/[0.06]"
            aria-label={collapsed ? 'Expand' : 'Collapse'}
          >
            <span className={`transition-transform ${collapsed ? 'rotate-180' : ''}`}>⌄</span>
          </button>
        </div>
      </div>

      {!collapsed && (
        <>
          {/* filters */}
          <div className="flex gap-2 px-4 pt-3">
            {chips.map((c) => (
              <button
                key={c.key}
                onClick={() => setFilter(c.key)}
                className={`rounded-full border px-3 py-1 text-xs transition ${
                  filter === c.key
                    ? 'border-white/[0.4] bg-white/[0.06] text-white'
                    : 'border-transparent bg-panel text-muted hover:text-white'
                }`}
              >
                {c.label}
                {c.key === 'completed' && done > 0 ? ` ${done}` : ''}
                {c.key === 'failed' && failed > 0 ? ` ${failed}` : ''}
              </button>
            ))}
          </div>

          {/* list */}
          <div className="mt-3 max-h-[46vh] min-h-[80px] overflow-y-auto px-4">
            {shown.length === 0 && <p className="py-6 text-center text-xs text-dim">Nothing here.</p>}
            {shown.map((j) => (
              <div key={j.id} className="flex items-center gap-3 border-b border-ring py-3 last:border-0">
                <StatusIcon status={j.status} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-white">{j.name}</p>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-muted">
                      {j.format}
                    </span>
                    <span className="truncate text-xs text-dim">
                      {j.status === 'active'
                        ? 'Rendering…'
                        : j.status === 'pending'
                          ? 'Queued'
                          : j.status === 'error'
                            ? j.error || 'Failed'
                            : `Saved${j.size ? ` · ${fmtSize(j.size)}` : ''}`}
                    </span>
                  </div>
                  {j.status === 'active' && (
                    <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-white/[0.06]">
                      <div className="h-full w-1/3 animate-pulse rounded-full bg-accent" />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* footer */}
          <div className="flex items-center gap-3 bg-white px-4 py-3 text-black">
            <Download size={20} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">
                {running ? `Exporting ${Math.min(done + failed + 1, total)} of ${total} item${total > 1 ? 's' : ''}` : `Done · ${done}/${total} saved${failed ? `, ${failed} failed` : ''}`}
              </p>
              <p className="truncate text-xs text-dim">{running ? active?.name ?? 'Preparing…' : 'All exports finished'}</p>
            </div>
            <span className="text-sm font-semibold">{pct}%</span>
          </div>
        </>
      )}
    </div>
  )
}

function StatusIcon({ status }: { status: ExportStatus }) {
  if (status === 'done') return <Check size={16} className="text-green-400" />
  if (status === 'error') return <X size={16} className="text-red-400" />
  if (status === 'active') return <Loader2 size={16} className="animate-spin text-muted" />
  return <Circle size={14} className="text-dim" />
}
