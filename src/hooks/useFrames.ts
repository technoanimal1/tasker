import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Frame } from '../lib/types'

export function useFrames(branchId: string | null) {
  const [frames, setFrames] = useState<Frame[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    if (!branchId) {
      setFrames([])
      setLoading(false)
      return
    }
    setLoading(true)
    const { data } = await supabase
      .from('frames')
      .select('*')
      .eq('branch_id', branchId)
      .order('created_at', { ascending: true })
    setFrames((data as Frame[]) ?? [])
    setLoading(false)
  }, [branchId])

  useEffect(() => {
    refresh()
  }, [refresh])

  async function create(input: {
    name: string
    width: number
    height: number
    background_color: string
  }): Promise<Frame> {
    const { data, error } = await supabase
      .from('frames')
      .insert({ ...input, branch_id: branchId, layout: [] })
      .select('*')
      .single()
    if (error) throw error
    await refresh()
    return data as Frame
  }

  async function save(id: string, patch: Partial<Frame>) {
    const { error } = await supabase
      .from('frames')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) throw error
    await refresh()
  }

  async function remove(id: string) {
    await supabase.from('frames').delete().eq('id', id)
    await refresh()
  }

  return { frames, loading, refresh, create, save, remove }
}
