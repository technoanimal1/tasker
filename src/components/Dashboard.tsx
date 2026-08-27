import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useProfile } from '../hooks/useProfile'
import { useBranches } from '../hooks/useBranches'
import { useBrandAssets } from '../hooks/useBrandAssets'
import { BrandAssets } from './BrandAssets'
import { FramesView } from './FramesView'
import { TemplateView } from './TemplateView'
import { BranchMenu } from './BranchMenu'
import { ThumbnailStudio } from './ThumbnailStudio'

type View = 'studio' | 'template' | 'frames' | 'assets'

export function Dashboard() {
  const { session } = useAuth()
  const { role } = useProfile()
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
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 sm:gap-4 sm:px-4 sm:py-3">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2.5 font-semibold">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand text-zinc-900 shadow-[0_0_20px_rgba(255,240,80,0.35)]">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <rect x="3" y="5" width="14" height="14" rx="3" fill="currentColor" opacity="0.35" />
                  <rect x="7" y="3" width="14" height="14" rx="3" stroke="currentColor" strokeWidth="2.2" />
                </svg>
              </span>
              <span className="hidden text-[15px] tracking-tight sm:inline">Thumbnail Studio</span>
            </div>

            <BranchMenu
              api={branchesApi}
              activeBranch={branch}
              onSelect={(id) => setBranchId(id)}
            />
          </div>

          <div className="order-last flex w-full items-center gap-1 overflow-x-auto rounded-lg bg-zinc-900/70 p-1 text-sm sm:order-none sm:w-auto">
            {([
              ['studio', 'Thumbnails'],
              ...(role === 'designer' ? [['template', 'Template'] as [View, string]] : []),
              ['frames', 'Frames'],
              ['assets', 'Brand assets'],
            ] as [View, string][]).map(([v, label]) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 transition ${
                  view === v ? 'bg-zinc-700/80 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            {role && (
              <span
                className={`hidden rounded-full px-2 py-0.5 text-[11px] font-medium sm:inline ${
                  role === 'designer' ? 'bg-accent/15 text-accent' : 'bg-zinc-800 text-zinc-400'
                }`}
              >
                {role}
              </span>
            )}
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
          <ThumbnailStudio role={role ?? 'client'} branch={branch} saveFrameParams={branchesApi.saveFrameParams} />
        ) : view === 'template' ? (
          <TemplateView />
        ) : view === 'assets' ? (
          <BrandAssets api={assetsApi} />
        ) : branch ? (
          <FramesView branch={branch} saveFrameParams={branchesApi.saveFrameParams} />
        ) : (
          <div className="py-20 text-center text-slate-500">Loading branch…</div>
        )}
      </main>
    </div>
  )
}
