import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useBranches } from '../hooks/useBranches'
import { useBrandAssets } from '../hooks/useBrandAssets'
import { BrandAssets } from './BrandAssets'
import { FramesView } from './FramesView'
import { BranchMenu } from './BranchMenu'
import { ThumbnailStudio } from './ThumbnailStudio'

type View = 'studio' | 'frames' | 'assets'

export function Dashboard() {
  const { session } = useAuth()
  const branchesApi = useBranches()
  const assetsApi = useBrandAssets()

  const [view, setView] = useState<View>('studio')
  const [branchId, setBranchId] = useState<string | null>(null)

  // Default to the default branch (or the first) once loaded.
  useEffect(() => {
    if (branchId || branchesApi.branches.length === 0) return
    const def = branchesApi.branches.find((b) => b.is_default) ?? branchesApi.branches[0]
    setBranchId(def.id)
  }, [branchesApi.branches, branchId])

  const branch = useMemo(
    () => branchesApi.branches.find((b) => b.id === branchId) ?? null,
    [branchesApi.branches, branchId],
  )

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-zinc-800 bg-[#0a0b0d]/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 font-semibold">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand text-white">◧</span>
              <span className="hidden sm:inline">Design Studio</span>
            </div>

            <BranchMenu
              api={branchesApi}
              activeBranch={branch}
              onSelect={(id) => setBranchId(id)}
            />
          </div>

          <div className="flex items-center gap-1 rounded-lg bg-zinc-900/70 p-1 text-sm">
            {([
              ['studio', 'Thumbnails'],
              ['frames', 'Frames'],
              ['assets', 'Brand assets'],
            ] as [View, string][]).map(([v, label]) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`rounded-md px-3 py-1.5 transition ${
                  view === v ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-zinc-500 lg:inline">{session?.user.email}</span>
            <button
              onClick={() => supabase.auth.signOut()}
              className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 transition hover:bg-zinc-800"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className={view === 'studio' ? 'px-4 py-4' : 'mx-auto max-w-7xl px-4 py-6'}>
        {view === 'studio' ? (
          <ThumbnailStudio />
        ) : view === 'assets' ? (
          <BrandAssets api={assetsApi} />
        ) : branch ? (
          <FramesView branch={branch} assets={assetsApi} />
        ) : (
          <div className="py-20 text-center text-slate-500">Loading branch…</div>
        )}
      </main>
    </div>
  )
}
