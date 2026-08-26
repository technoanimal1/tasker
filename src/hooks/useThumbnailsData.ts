import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Thumbnail } from '../lib/thumb'

export function useThumbnailsData() {
  const [thumbnails, setThumbnails] = useState<Thumbnail[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    const { data } = await supabase
      .from('thumbnails')
      .select('*')
      .order('created_at', { ascending: true })
    setThumbnails((data as Thumbnail[]) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const setAccent = useCallback(async (id: string, accent_color: string) => {
    setThumbnails((ts) => ts.map((t) => (t.id === id ? { ...t, accent_color } : t)))
    await supabase.from('thumbnails').update({ accent_color }).eq('id', id)
  }, [])

  const saveOverrides = useCallback(
    async (id: string, overrides: Record<string, unknown>) => {
      setThumbnails((ts) => ts.map((t) => (t.id === id ? { ...t, overrides } : t)))
      await supabase.from('thumbnails').update({ overrides }).eq('id', id)
    },
    [],
  )

  const saveAnim = useCallback(async (id: string, anim_video_url: string | null, anim_prompt: string | null) => {
    setThumbnails((ts) => ts.map((t) => (t.id === id ? { ...t, anim_video_url, anim_prompt } : t)))
    await supabase.from('thumbnails').update({ anim_video_url, anim_prompt }).eq('id', id)
  }, [])

  return { thumbnails, loading, refresh, setAccent, saveOverrides, saveAnim }
}
