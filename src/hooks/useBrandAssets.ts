import { useCallback, useEffect, useState } from 'react'
import { supabase, BRAND_BUCKET } from '../lib/supabase'
import type { AssetKind, BrandAsset } from '../lib/types'

async function imageSize(file: File): Promise<{ width: number | null; height: number | null }> {
  if (file.type === 'image/svg+xml') return { width: null, height: null }
  return new Promise((resolve) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight })
      URL.revokeObjectURL(url)
    }
    img.onerror = () => {
      resolve({ width: null, height: null })
      URL.revokeObjectURL(url)
    }
    img.src = url
  })
}

export function useBrandAssets() {
  const [assets, setAssets] = useState<BrandAsset[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    const { data } = await supabase
      .from('brand_assets')
      .select('*')
      .eq('is_active', true)
      .order('updated_at', { ascending: false })
    setAssets((data as BrandAsset[]) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const byKind = useCallback(
    (kind: AssetKind) => assets.find((a) => a.kind === kind) ?? null,
    [assets],
  )

  async function upload(kind: AssetKind, file: File) {
    const clean = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const path = `${kind}/${Date.now()}-${clean}`

    const { error: upErr } = await supabase.storage
      .from(BRAND_BUCKET)
      .upload(path, file, { cacheControl: '3600', upsert: false, contentType: file.type })
    if (upErr) throw upErr

    const { data: pub } = supabase.storage.from(BRAND_BUCKET).getPublicUrl(path)
    const { width, height } = await imageSize(file)

    // Retire the current active asset of this kind, then activate the new one.
    await supabase.from('brand_assets').update({ is_active: false }).eq('kind', kind).eq('is_active', true)

    const { error: insErr } = await supabase.from('brand_assets').insert({
      kind,
      name: file.name,
      storage_path: path,
      url: pub.publicUrl,
      mime: file.type,
      width,
      height,
      is_active: true,
    })
    if (insErr) throw insErr

    await refresh()
  }

  return { assets, byKind, loading, refresh, upload }
}
