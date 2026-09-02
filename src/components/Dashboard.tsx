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
import { useEntitlements } from '../hooks/useEntitlements'
import { ClientOnboarding } from './ClientOnboarding'

type View = 'studio' | 'template' | 'frames' | 'assets'

export function Dashboard() {
  const { session } = useAuth()
  const { role } = useProfile()
  const branchesApi = useBranches()
  const assetsApi = useBrandAssets()
  const ent = useEntitlements()
  const clientLoading = role === 'client' && ent.loading
  const needsOnboarding = role === 'client' && !ent.loading && ent.entitlements.length === 0

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
  // The client's uploaded logotype (Brand assets) brands the header when present.
  const brandLogo = assetsApi.byKind('logo')?.url ?? null

  return (
    <div className="min-h-screen">
      {/* Nav: black at 72% behind a 14px blur, one hairline, 1270px inner row. */}
      <header className="sticky top-0 z-20 border-b border-white/[0.08] bg-black/[0.72] backdrop-blur-[14px]">
        <div className="mx-auto flex max-w-[1270px] flex-wrap items-center justify-between gap-2 px-5 py-3.5 sm:gap-4">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => {
                setView('studio')
                window.scrollTo({ top: 0, behavior: 'smooth' })
              }}
              title="Home"
              className="flex items-center gap-2.5 font-semibold outline-none transition hover:opacity-80 active:scale-95"
            >
              {brandLogo ? (
                // Client's uploaded logotype, rendered as a white (on-dark) mark
                // so it reads on the dark header regardless of the file's colour.
                <img
                  src={brandLogo}
                  alt="Logo"
                  className="h-8 w-auto max-w-[140px] object-contain [filter:brightness(0)_invert(1)]"
                />
              ) : (
                <>
                  <span className="grid h-8 w-8 place-items-center rounded-lg bg-yellow text-black">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <rect x="3" y="5" width="14" height="14" rx="3" fill="currentColor" opacity="0.35" />
                      <rect x="7" y="3" width="14" height="14" rx="3" stroke="currentColor" strokeWidth="2.2" />
                    </svg>
                  </span>
                  <span className="hidden text-[15px] font-semibold tracking-[-0.02em] sm:inline">thumbs.store</span>
                </>
              )}
            </button>

            <BranchMenu
              api={branchesApi}
              activeBranch={branch}
              onSelect={(id) => setBranchId(id)}
            />
          </div>

          <div className="order-last flex w-full items-center gap-1.5 overflow-x-auto sm:order-none sm:w-auto">
            {([
              ['studio', 'Thumbnails'],
              ...(role === 'designer' ? [['template', 'Template'] as [View, string]] : []),
              ['frames', 'Frames'],
              ['assets', 'Brand assets'],
            ] as [View, string][]).map(([v, label]) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`chip shrink-0 ${view === v ? 'chip-on' : ''}`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            {role && (
              <span
                className={`hidden rounded-full px-2 py-0.5 text-[11px] font-medium sm:inline ${
                  role === 'designer' ? 'bg-accent/15 text-accent' : 'bg-white/[0.06] text-muted'
                }`}
              >
                {role}
              </span>
            )}
            <span className="hidden text-[13px] text-dim lg:inline">{session?.user.email}</span>
            <button onClick={() => supabase.auth.signOut()} className="btn-secondary btn-sm">
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className={view === 'studio' && !needsOnboarding && !clientLoading ? 'px-5 py-5' : 'mx-auto max-w-[1270px] px-5 py-10'}>
        {clientLoading ? (
          <div className="py-20 text-center text-dim">Loading…</div>
        ) : needsOnboarding ? (
          <ClientOnboarding providers={ent.providers} onChoose={ent.chooseFreeProvider} />
        ) : view === 'studio' ? (
          <ThumbnailStudio role={role ?? 'client'} branch={branch} saveFrameParams={branchesApi.saveFrameParams} />
        ) : view === 'template' ? (
          <TemplateView />
        ) : view === 'assets' ? (
          <BrandAssets api={assetsApi} />
        ) : branch ? (
          <FramesView branch={branch} saveFrameParams={branchesApi.saveFrameParams} />
        ) : (
          <div className="py-20 text-center text-dim">Loading branch…</div>
        )}
      </main>
    </div>
  )
}
