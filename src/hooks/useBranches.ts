import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Branch, Frame } from '../lib/types'

export function useBranches() {
  const [branches, setBranches] = useState<Branch[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    const { data } = await supabase
      .from('branches')
      .select('*')
      .order('created_at', { ascending: true })
    setBranches((data as Branch[]) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  async function create(name: string, description?: string): Promise<Branch> {
    const { data, error } = await supabase
      .from('branches')
      .insert({ name, description: description ?? null })
      .select('*')
      .single()
    if (error) throw error
    await refresh()
    return data as Branch
  }

  // Fork: new branch that copies the source branch's frames. Brand assets are
  // shared (referenced by kind), so they are NOT copied — updating an asset
  // still propagates to the fork.
  async function fork(source: Branch, name: string): Promise<Branch> {
    const { data: created, error } = await supabase
      .from('branches')
      .insert({ name, description: `Forked from ${source.name}`, parent_branch_id: source.id })
      .select('*')
      .single()
    if (error) throw error
    const branch = created as Branch

    const { data: frames } = await supabase.from('frames').select('*').eq('branch_id', source.id)
    const rows = (frames as Frame[]) ?? []
    if (rows.length) {
      await supabase.from('frames').insert(
        rows.map((f) => ({
          branch_id: branch.id,
          name: f.name,
          width: f.width,
          height: f.height,
          background_color: f.background_color,
          layout: f.layout,
        })),
      )
    }
    await refresh()
    return branch
  }

  return { branches, loading, refresh, create, fork }
}
