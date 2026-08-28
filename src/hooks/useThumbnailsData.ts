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

  const saveLogoWhite = useCallback(async (id: string, logo_white_url: string | null) => {
    setThumbnails((ts) => ts.map((t) => (t.id === id ? { ...t, logo_white_url } : t)))
    await supabase.from('thumbnails').update({ logo_white_url }).eq('id', id)
  }, [])

  // Record a freshly baked grid preview (URL + the signature it was baked at).
  const savePreview = useCallback(async (id: string, preview_url: string, preview_sig: string) => {
    setThumbnails((ts) => ts.map((t) => (t.id === id ? { ...t, preview_url, preview_sig } : t)))
    await supabase.from('thumbnails').update({ preview_url, preview_sig }).eq('id', id)
  }, [])

  const deleteThumbnail = useCallback(async (id: string) => {
    setThumbnails((ts) => ts.filter((t) => t.id !== id))
    const { error } = await supabase.from('thumbnails').delete().eq('id', id)
    if (error) await refresh() // put it back if the delete was rejected
  }, [refresh])

  // Re-insert a previously deleted thumbnail (for undo).
  const insertThumbnail = useCallback(async (t: Thumbnail) => {
    setThumbnails((ts) => (ts.some((x) => x.id === t.id) ? ts : [...ts, t]))
    const { error } = await supabase.from('thumbnails').insert(t as never)
    if (error) await refresh()
  }, [refresh])

  return { thumbnails, loading, refresh, setAccent, saveOverrides, saveAnim, saveLogoWhite, savePreview, deleteThumbnail, insertThumbnail }
}
