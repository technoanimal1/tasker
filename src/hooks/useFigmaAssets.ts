import { useEffect, useState } from 'react'
import { supabase, figmaProxyUrl } from '../lib/supabase'
import { whitenLogo } from '../lib/whiten'
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
  const [whiteMap, setWhiteMap] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)

  // Auto-generate a white logotype from the colour logo when Figma has no white
  // node — a deterministic canvas recolour (keeps the shape, fills white).
  useEffect(() => {
    let active = true
    ;(async () => {
      for (const t of thumbnails) {
        if (t.figma_logo_white_node) continue
        const fk = t.figma_file_key
        const cn = t.figma_logo_color_node
        if (!fk || !cn || whiteMap[t.id]) continue
        const data = await whitenLogo(figmaProxyUrl(fk, cn, 3))
        if (active && data) setWhiteMap((m) => ({ ...m, [t.id]: data }))
      }
    })()
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thumbnails])

  useEffect(() => {
    let active = true
    ;(async () => {
      setLoading(true)
      const result: Record<string, string> = {}
      const byFile: Record<string, Set<string>> = {}

      for (const t of thumbnails) {
        const fk = t.figma_file_key
        if (!fk) continue
        for (const n of [t.figma_bg_node, t.figma_kv_node, t.figma_logo_color_node, t.figma_logo_white_node]) {
          if (!n) continue
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
    return {
      bg: u(t.figma_bg_node),
      kv: u(t.figma_kv_node),
      logoColor: u(t.figma_logo_color_node),
      logoWhite: u(t.figma_logo_white_node) ?? whiteMap[t.id],
    }
  }

  return { assetsFor, loading }
}
