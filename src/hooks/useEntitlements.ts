import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export interface Entitlement {
  id: string
  user_id: string
  provider_id: string
  tier: 'free' | 'full'
  quota: number | null
  created_at: string
}
export interface Provider {
  id: string
  name: string
}

/** The current client's provider entitlements and picked-game library. */
export function useEntitlements() {
  const [entitlements, setEntitlements] = useState<Entitlement[]>([])
  const [providers, setProviders] = useState<Provider[]>([])
  const [library, setLibrary] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    const [{ data: ents }, { data: provs }, { data: games }] = await Promise.all([
      supabase.from('client_entitlements').select('*'),
      supabase.from('providers').select('id, name').order('name'),
      supabase.from('client_games').select('thumbnail_id'),
    ])
    setEntitlements((ents as Entitlement[]) ?? [])
    setProviders((provs as Provider[]) ?? [])
    setLibrary(new Set(((games as { thumbnail_id: string }[]) ?? []).map((g) => g.thumbnail_id)))
    setLoading(false)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  /** Client self-service: claim a provider on the free tier (100 games). */
  const chooseFreeProvider = useCallback(
    async (provider_id: string, quota = 100) => {
      const uid = (await supabase.auth.getUser()).data.user?.id
      if (!uid) return
      await supabase.from('client_entitlements').insert({ user_id: uid, provider_id, tier: 'free', quota })
      await refresh()
    },
    [refresh],
  )

  /** Add/remove a game from the client's library (respecting the free quota). */
  const toggleGame = useCallback(
    async (thumbnail_id: string, quota: number | null) => {
      const uid = (await supabase.auth.getUser()).data.user?.id
      if (!uid) return
      if (library.has(thumbnail_id)) {
        setLibrary((s) => {
          const n = new Set(s)
          n.delete(thumbnail_id)
          return n
        })
        await supabase.from('client_games').delete().eq('thumbnail_id', thumbnail_id)
      } else {
        if (quota != null && library.size >= quota) return false
        setLibrary((s) => new Set(s).add(thumbnail_id))
        await supabase.from('client_games').insert({ user_id: uid, thumbnail_id })
      }
      return true
    },
    [library],
  )

  return { entitlements, providers, library, loading, refresh, chooseFreeProvider, toggleGame }
}
