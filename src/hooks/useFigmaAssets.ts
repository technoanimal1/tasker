import { useCallback, useRef, useState } from 'react'
import { supabase, assetUrl } from '../lib/supabase'
import type { AssetUrls, Thumbnail } from '../lib/thumb'

// Figma render URLs last ~30 days; we cache resolved URLs per browser for 6h and
// re-resolve on demand via the figma-catalog edge function.
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

/**
 * Resolves a thumbnail's image layers.
 *
 * Layers we host ourselves (a stored path in the `assets` bucket) are served
 * straight from our CDN — no Figma call. Any layer not yet cached is resolved
 * from Figma's (rate-limited) API *lazily and on demand*: `ensureResolved(t)`
 * is called by the grid tile when it scrolls into view and by the editor for
 * the open game, so a 6,000-game catalogue never triggers a giant up-front
 * resolve. Requests are de-duped and debounce-batched per file.
 */
export function useFigmaAssets(_thumbnails: Thumbnail[], scale = 2) {
  const [map, setMap] = useState<Record<string, string>>({})
  const pending = useRef<Record<string, Set<string>>>({})
  const requested = useRef<Set<string>>(new Set())
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const flush = useCallback(() => {
    const batch = pending.current
    pending.current = {}
    for (const [fk, set] of Object.entries(batch)) {
      const nodes = [...set]
      supabase.functions
        .invoke('figma-catalog', { body: { action: 'resolve', fileKey: fk, nodes, scale } })
        .then(({ data }) => {
          const images: Record<string, string> = data?.images ?? {}
          const upd: Record<string, string> = {}
          for (const n of nodes) {
            const u = images[n]
            if (u) {
              upd[`${fk}:${n}`] = u
              cacheSet(fk, n, scale, u)
            }
          }
          if (Object.keys(upd).length) setMap((m) => ({ ...m, ...upd }))
        })
        .catch(() => {
          /* transient (rate limit / offline) — the tile keeps its placeholder */
        })
    }
  }, [scale])

  /** Ask for a thumbnail's not-yet-hosted layers to be resolved from Figma. */
  const ensureResolved = useCallback(
    (t: Thumbnail) => {
      const fk = t.figma_file_key
      if (!fk) return
      const pairs: [string | null, string | null][] = [
        [t.figma_bg_node, t.bg_path],
        [t.figma_kv_node, t.kv_path],
        [t.figma_logo_color_node, t.logo_color_path],
        [t.figma_logo_white_node, t.logo_white_path],
      ]
      let added = false
      const found: Record<string, string> = {}
      for (const [n, path] of pairs) {
        if (!n || path) continue // hosted on our CDN → no Figma needed
        const key = `${fk}:${n}`
        if (requested.current.has(key)) continue
        const c = cacheGet(fk, n, scale)
        if (c) {
          found[key] = c
          requested.current.add(key)
          continue
        }
        requested.current.add(key)
        ;(pending.current[fk] ??= new Set()).add(n)
        added = true
      }
      if (Object.keys(found).length) setMap((m) => ({ ...m, ...found }))
      if (added) {
        if (timer.current) clearTimeout(timer.current)
        timer.current = setTimeout(flush, 200)
      }
    },
    [scale, flush],
  )

  const assetsFor = useCallback(
    (t: Thumbnail): AssetUrls => {
      const fk = t.figma_file_key
      const u = (n: string | null) => (fk && n ? map[`${fk}:${n}`] : undefined)
      // Prefer our own hosted copy (CDN, no Figma dependency); fall back to the
      // lazily-resolved Figma URL while a layer hasn't been cached yet.
      return {
        bg: assetUrl(t.bg_path) ?? u(t.figma_bg_node),
        kv: assetUrl(t.kv_path) ?? u(t.figma_kv_node),
        logoColor: assetUrl(t.logo_color_path) ?? u(t.figma_logo_color_node),
        // White logo: hosted copy → Figma white node → server-derived white URL.
        // No client knockout fallback (a busy/plate logo becomes a white blob).
        logoWhite: assetUrl(t.logo_white_path) ?? u(t.figma_logo_white_node) ?? t.logo_white_url ?? undefined,
        animVideo: t.anim_video_url ?? undefined,
      }
    },
    [map],
  )

  return { assetsFor, ensureResolved, loading: false }
}
