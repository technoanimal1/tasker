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
        <h1 className="text-xl font-semibold text-zinc-100">Choose your provider</h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-zinc-400">
          Pick a game provider to get started — you get <span className="font-medium text-zinc-200">100 games free</span>.
          Need the full catalogue? Purchase full access any time.
        </p>
      </div>

      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        {providers.length === 0 && (
          <p className="col-span-full text-center text-sm text-zinc-500">No providers available yet.</p>
        )}
        {providers.map((p) => (
          <div
            key={p.id}
            className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/50 p-4"
          >
            <div>
              <p className="font-medium text-zinc-100">{p.name}</p>
              <p className="text-xs text-zinc-500">100 games free</p>
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
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-zinc-900 hover:bg-accent-dark disabled:opacity-50"
            >
              {busy === p.id ? 'Unlocking…' : 'Choose'}
            </button>
          </div>
        ))}
      </div>

      <p className="mt-8 text-center text-xs text-zinc-600">
        You can add more providers later, or contact sales for full catalogue access.
      </p>
    </div>
  )
}
