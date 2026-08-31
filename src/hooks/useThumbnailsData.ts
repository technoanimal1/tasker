import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Thumbnail } from '../lib/thumb'

export interface ProviderCount {
  provider: string
  count: number
}

/**
 * Loads thumbnails lazily, provider-by-provider, instead of pulling the whole
 * (thousands-strong) catalogue up front. On mount it fetches only a lightweight
 * provider index (name + count); a provider's games are fetched the first time
 * that category is opened (or auto-loaded for the first one). This keeps the
 * client experience snappy — you load a provider's thumbnails as you jump into
 * its category and scroll, not all at once.
 */
export function useThumbnailsData() {
  const [thumbnails, setThumbnails] = useState<Thumbnail[]>([])
  const [providerCounts, setProviderCounts] = useState<ProviderCount[]>([])
  const [loadedProviders, setLoadedProviders] = useState<Set<string>>(new Set())
  const [providerLoading, setProviderLoading] = useState<string | null>(null)
  const [pageItems, setPageItems] = useState<Thumbnail[]>([]) // current "All" page
  const [pageLoading, setPageLoading] = useState(false)
  const [loading, setLoading] = useState(true) // initial provider-index load only
  // Infinite-scroll "All" list: accumulates across batches as you scroll.
  const [allItems, setAllItems] = useState<Thumbnail[]>([])
  const [allLoading, setAllLoading] = useState(false)
  const [allDone, setAllDone] = useState(false)
  const allOffset = useRef(0)
  const allDoneRef = useRef(false)
  const allLoadingRef = useRef(false)

  const mergeIn = (items: Thumbnail[]) =>
    setThumbnails((ts) => {
      const have = new Set(ts.map((t) => t.id))
      const add = items.filter((i) => !have.has(i.id))
      return add.length ? [...ts, ...add] : ts
    })

  // Providers we've already started fetching (claimed synchronously so an
  // expand + auto-load can't double-fetch the same provider).
  const claimed = useRef<Set<string>>(new Set())

  const fetchProvider = useCallback(async (provider: string): Promise<Thumbnail[]> => {
    const pageSize = 1000
    const all: Thumbnail[] = []
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await supabase
        .from('thumbnails')
        .select('*')
        .eq('provider', provider)
        .order('name', { ascending: true })
        .range(from, from + pageSize - 1)
      if (error || !data || data.length === 0) break
      all.push(...(data as Thumbnail[]))
      if (data.length < pageSize) break
    }
    return all
  }, [])

  /** Load a provider's thumbnails on demand (no-op if already loaded/loading). */
  const ensureProvider = useCallback(
    async (provider: string) => {
      if (!provider || claimed.current.has(provider)) return
      claimed.current.add(provider)
      setProviderLoading(provider)
      try {
        const games = await fetchProvider(provider)
        mergeIn(games)
        setLoadedProviders((s) => new Set(s).add(provider))
      } catch {
        claimed.current.delete(provider) // allow a retry on failure
      } finally {
        setProviderLoading((p) => (p === provider ? null : p))
      }
    },
    [fetchProvider],
  )

  /** Fetch one page of the whole catalogue (for the "All" view), ordered by
   *  provider then name. Also merges into `thumbnails` so edits/assets stay in sync. */
  const loadPage = useCallback(async (pageIndex: number, pageSize = 30) => {
    setPageLoading(true)
    const from = pageIndex * pageSize
    const { data } = await supabase
      .from('thumbnails')
      .select('*')
      .order('provider', { ascending: true })
      .order('name', { ascending: true })
      .range(from, from + pageSize - 1)
    const items = (data as Thumbnail[]) ?? []
    setPageItems(items)
    mergeIn(items)
    setPageLoading(false)
  }, [])

  /** Append the next batch of the whole catalogue for infinite scroll (ordered
   *  by provider then name). No-ops while a batch is in flight or the end is
   *  reached. Also merges into `thumbnails` so edits/assets stay in sync. */
  const loadMoreAll = useCallback(async (pageSize = 30) => {
    if (allLoadingRef.current || allDoneRef.current) return
    allLoadingRef.current = true
    setAllLoading(true)
    try {
      const from = allOffset.current
      const { data } = await supabase
        .from('thumbnails')
        .select('*')
        .order('provider', { ascending: true })
        .order('name', { ascending: true })
        .range(from, from + pageSize - 1)
      const items = (data as Thumbnail[]) ?? []
      setAllItems((cur) => {
        const have = new Set(cur.map((t) => t.id))
        const add = items.filter((i) => !have.has(i.id))
        return add.length ? [...cur, ...add] : cur
      })
      mergeIn(items)
      allOffset.current = from + items.length
      if (items.length < pageSize) {
        allDoneRef.current = true
        setAllDone(true)
      }
    } finally {
      allLoadingRef.current = false
      setAllLoading(false)
    }
  }, [])

  /** Search games by name across the whole catalogue (server-side). */
  const searchGames = useCallback(async (q: string): Promise<Thumbnail[]> => {
    const term = q.trim()
    if (!term) return []
    const { data } = await supabase
      .from('thumbnails')
      .select('*')
      .ilike('name', `%${term}%`)
      .order('name', { ascending: true })
      .limit(60)
    const items = (data as Thumbnail[]) ?? []
    mergeIn(items)
    return items
  }, [])

  const refresh = useCallback(async () => {
    setLoading(true)
    claimed.current = new Set()
    setLoadedProviders(new Set())
    setThumbnails([])
    setPageItems([])
    setAllItems([])
    allOffset.current = 0
    allDoneRef.current = false
    setAllDone(false)
    const { data } = await supabase.rpc('provider_counts')
    const counts = ((data as { provider: string; cnt: number }[]) ?? []).map((r) => ({
      provider: r.provider,
      count: Number(r.cnt),
    }))
    setProviderCounts(counts)
    setLoading(false)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const setAccent = useCallback(async (id: string, accent_color: string) => {
    setThumbnails((ts) => ts.map((t) => (t.id === id ? { ...t, accent_color } : t)))
    await supabase.from('thumbnails').update({ accent_color }).eq('id', id)
  }, [])

  const saveOverrides = useCallback(async (id: string, overrides: Record<string, unknown>) => {
    setThumbnails((ts) => ts.map((t) => (t.id === id ? { ...t, overrides } : t)))
    await supabase.from('thumbnails').update({ overrides }).eq('id', id)
  }, [])

  const saveAnim = useCallback(async (id: string, anim_video_url: string | null, anim_prompt: string | null) => {
    // Removing the clip also clears its alpha-packed rendition.
    const patch = anim_video_url
      ? { anim_video_url, anim_prompt }
      : { anim_video_url: null, anim_prompt: null, anim_alpha_path: null }
    setThumbnails((ts) => ts.map((t) => (t.id === id ? { ...t, ...patch } : t)))
    await supabase.from('thumbnails').update(patch).eq('id', id)
  }, [])

  // Persist the alpha-packed MP4 URL (transparent video for every browser).
  const saveAnimAlpha = useCallback(async (id: string, anim_alpha_path: string | null) => {
    setThumbnails((ts) => ts.map((t) => (t.id === id ? { ...t, anim_alpha_path } : t)))
    await supabase.from('thumbnails').update({ anim_alpha_path }).eq('id', id)
  }, [])

  const saveLogoWhite = useCallback(async (id: string, logo_white_url: string | null) => {
    setThumbnails((ts) => ts.map((t) => (t.id === id ? { ...t, logo_white_url } : t)))
    await supabase.from('thumbnails').update({ logo_white_url }).eq('id', id)
  }, [])

  const saveLogoColor = useCallback(async (id: string, logo_color_url: string | null) => {
    setThumbnails((ts) => ts.map((t) => (t.id === id ? { ...t, logo_color_url } : t)))
    await supabase.from('thumbnails').update({ logo_color_url }).eq('id', id)
  }, [])

  const savePreview = useCallback(async (id: string, preview_url: string, preview_sig: string) => {
    setThumbnails((ts) => ts.map((t) => (t.id === id ? { ...t, preview_url, preview_sig } : t)))
    await supabase.from('thumbnails').update({ preview_url, preview_sig }).eq('id', id)
  }, [])

  const deleteThumbnail = useCallback(async (id: string) => {
    setThumbnails((ts) => ts.filter((t) => t.id !== id))
    await supabase.from('thumbnails').delete().eq('id', id)
  }, [])

  // Re-insert a previously deleted thumbnail (for undo).
  const insertThumbnail = useCallback(async (t: Thumbnail) => {
    setThumbnails((ts) => (ts.some((x) => x.id === t.id) ? ts : [...ts, t]))
    await supabase.from('thumbnails').insert(t as never)
  }, [])

  return {
    thumbnails,
    providerCounts,
    loadedProviders,
    providerLoading,
    pageItems,
    pageLoading,
    loadPage,
    allItems,
    allLoading,
    allDone,
    loadMoreAll,
    searchGames,
    loading,
    ensureProvider,
    refresh,
    setAccent,
    saveOverrides,
    saveAnim,
    saveAnimAlpha,
    saveLogoWhite,
    saveLogoColor,
    savePreview,
    deleteThumbnail,
    insertThumbnail,
  }
}
