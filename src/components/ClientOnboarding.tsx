import { useState } from 'react'
import type { Provider } from '../hooks/useEntitlements'

/**
 * First-run screen for a client with no entitlements: choose a provider to
 * unlock 100 free games from it. Purchased/full access is granted separately.
 */
export function ClientOnboarding({
  providers,
  onChoose,
}: {
  providers: Provider[]
  onChoose: (providerId: string) => Promise<void>
}) {
  const [busy, setBusy] = useState<string | null>(null)

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <div className="text-center">
        <h1 className="text-xl font-semibold text-white">Choose your provider</h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted">
          Pick a game provider to get started — you get <span className="font-medium text-white">100 games free</span>.
          Need the full catalogue? Purchase full access any time.
        </p>
      </div>

      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        {providers.length === 0 && (
          <p className="col-span-full text-center text-sm text-dim">No providers available yet.</p>
        )}
        {providers.map((p) => (
          <div
            key={p.id}
            className="flex items-center justify-between rounded-card border border-ring bg-panel p-4"
          >
            <div>
              <p className="font-medium text-white">{p.name}</p>
              <p className="text-xs text-dim">100 games free</p>
            </div>
            <button
              disabled={busy !== null}
              onClick={async () => {
                setBusy(p.id)
                try {
                  await onChoose(p.id)
                } finally {
                  setBusy(null)
                }
              }}
              className="rounded-pill bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-yellow disabled:opacity-50"
            >
              {busy === p.id ? 'Unlocking…' : 'Choose'}
            </button>
          </div>
        ))}
      </div>

      <p className="mt-8 text-center text-xs text-dim">
        You can add more providers later, or contact sales for full catalogue access.
      </p>
    </div>
  )
}
