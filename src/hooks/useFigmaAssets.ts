import { useEffect, useState } from 'react'
import { supabase, assetUrl } from '../lib/supabase'
import type { AssetUrls, Thumbnail } from '../lib/thumb'

// Figma render URLs last ~30 days; we cache resolved URLs per browser for 6h and
// re-resolve as needed via the figma-catalog edge function.
const TTL = 6 * 3600 * 1000

function ckey(fileKey: string, node: string, scale: number) {
  return `figc:${fileKey}:${node}:${scale}`
}
function cacheGet(fileKey: string, node: string, scale: number): string | null {
  try {
    const raw = localStorage.getItem(ckey(fileKey, node, scale))
    if (!raw) return null
    const o = JSON.parse(raw)
    return o.exp > Date.now() ? o.url : null
  } catch {
    return null
  }
}
function cacheSet(fileKey: string, node: string, scale: number, url: string) {
  try {
    localStorage.setItem(ckey(fileKey, node, scale), JSON.stringify({ url, exp: Date.now() + TTL }))
  } catch {
    /* ignore */
  }
}

export function useFigmaAssets(thumbnails: Thumbnail[], scale = 2) {
  const [map, setMap] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    ;(async () => {
      setLoading(true)
      const result: Record<string, string> = {}
      const byFile: Record<string, Set<string>> = {}

      for (const t of thumbnails) {
        const fk = t.figma_file_key
        if (!fk) continue
        // Only resolve from Figma the layers we don't already host ourselves.
        // A layer with a stored path in the `assets` bucket is served from our
        // CDN (assetsFor below), so it never touches Figma's rate-limited API.
        const pairs: [string | null, string | null][] = [
          [t.figma_bg_node, t.bg_path],
          [t.figma_kv_node, t.kv_path],
          [t.figma_logo_color_node, t.logo_color_path],
          [t.figma_logo_white_node, t.logo_white_path],
        ]
        for (const [n, path] of pairs) {
          if (!n || path) continue
          const cached = cacheGet(fk, n, scale)
          if (cached) result[`${fk}:${n}`] = cached
          else (byFile[fk] ??= new Set()).add(n)
        }
      }

      for (const [fk, set] of Object.entries(byFile)) {
        const nodes = [...set]
        const { data } = await supabase.functions.invoke('figma-catalog', {
          body: { action: 'resolve', fileKey: fk, nodes, scale },
        })
        const images: Record<string, string> = data?.images ?? {}
        for (const n of nodes) {
          const u = images[n]
          if (u) {
            result[`${fk}:${n}`] = u
            cacheSet(fk, n, scale, u)
          }
        }
      }

      if (active) {
        setMap(result)
        setLoading(false)
      }
    })()
    return () => {
      active = false
    }
  }, [thumbnails, scale])

  function assetsFor(t: Thumbnail): AssetUrls {
    const fk = t.figma_file_key
    const u = (n: string | null) => (fk && n ? map[`${fk}:${n}`] : undefined)
    // Prefer our own hosted copy (CDN, no Figma dependency); fall back to the
    // live-resolved Figma URL while a layer hasn't been cached yet.
    return {
      bg: assetUrl(t.bg_path) ?? u(t.figma_bg_node),
      kv: assetUrl(t.kv_path) ?? u(t.figma_kv_node),
      logoColor: assetUrl(t.logo_color_path) ?? u(t.figma_logo_color_node),
      // White logo: hosted copy → Figma white node → server-derived white URL.
      // No client knockout fallback (a busy/plate logo becomes a white blob), so
      // when no clean white exists the render falls back to the colour logo.
      logoWhite: assetUrl(t.logo_white_path) ?? u(t.figma_logo_white_node) ?? t.logo_white_url ?? undefined,
      animVideo: t.anim_video_url ?? undefined,
    }
  }

  return { assetsFor, loading }
}
