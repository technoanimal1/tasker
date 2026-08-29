import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ThumbnailCard } from './Thumbnail'
import { frameSize, type AssetUrls, type TemplateParams, type Thumbnail } from '../lib/thumb'
import { previewSig } from '../lib/previewSig'
import { bakeUploadPreview, enqueueBake } from '../lib/bakePreview'

/**
 * One grid tile. Strategy:
 *  - A baked flat WebP (CDN) is shown instantly for a fast catalogue overview —
 *    no Figma layers fetched while just browsing.
 *  - The live layered ThumbnailCard mounts on top only when needed (the viewer
 *    is editing / `live`, or no fresh preview exists yet) so setting changes
 *    reflect immediately. Once its layers load it fully covers the WebP.
 *  - When a designer views a tile whose preview is missing/stale, it re-bakes in
 *    the background (debounced + globally throttled) to refresh the cache.
 */
export function GridTile({
  thumb,
  params,
  assets,
  showFrame,
  gridW,
  phase = 0,
  live,
  canBake,
  onBaked,
  onNeedAssets,
}: {
  thumb: Thumbnail
  params: TemplateParams
  assets: AssetUrls
  showFrame: boolean
  gridW: number
  phase?: number
  live: boolean
  canBake: boolean
  onBaked: (id: string, url: string, sig: string) => void
  /** Called when the tile scrolls into view, so its Figma layers resolve lazily. */
  onNeedAssets?: () => void
}) {
  const fr = frameSize(params.sizeKey)

  const sig = previewSig(params, thumb, showFrame)
  const fresh = !!thumb.preview_url && thumb.preview_sig === sig

  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  const [liveReady, setLiveReady] = useState(false)
  // The tile fills its grid cell and scales to that width, so it's fully visible
  // and responsive (2-up on mobile, more on wider screens) instead of overflowing.
  const [cw, setCw] = useState(gridW)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width
      if (width && Math.abs(width - cw) > 0.5) setCw(width)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [cw])
  const h = (cw * fr.h) / fr.w

  // Observe visibility (pre-load a screen ahead), then stay mounted.
  useEffect(() => {
    if (visible) return
    const el = ref.current
    if (!el) return
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true)
      onNeedAssets?.()
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true)
          onNeedAssets?.()
          io.disconnect()
        }
      },
      { rootMargin: '800px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [visible])

  // Mount the heavy live layered card ONLY when actually editing this tile, or
  // when there's no baked image at all to show. A merely *stale* preview (e.g.
  // after a render-version bump) keeps showing its WebP and re-bakes in the
  // background — we must not flip every visible tile to a live render, which on
  // mobile mounts dozens of full renders at once and exhausts memory.
  const showLive = visible && (live || !thumb.preview_url)

  // Background re-bake for designers when the on-screen preview is stale/missing.
  // Debounced so dragging a slider doesn't bake on every frame; the global queue
  // caps concurrency. Re-checks freshness at fire time via the latest sig.
  useEffect(() => {
    if (!canBake || !visible || fresh) return
    const t = setTimeout(() => {
      enqueueBake(async () => {
        try {
          const url = await bakeUploadPreview(thumb, params, sig)
          onBaked(thumb.id, url, sig)
        } catch {
          /* transient (rate limit / offline) — a later view retries */
        }
      })
    }, 1500)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canBake, visible, fresh, sig])

  return (
    <div ref={ref} style={{ position: 'relative', width: '100%', height: h }}>
      {/* instant WebP underlay (fresh or stale-but-useful) */}
      {thumb.preview_url && (
        <img
          src={thumb.preview_url}
          alt=""
          draggable={false}
          decoding="async"
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'fill',
            // hide once the live card has painted, to avoid a double image
            opacity: showLive && liveReady ? 0 : 1,
          }}
        />
      )}

      {/* skeleton only when there's nothing to show yet */}
      {!thumb.preview_url && !showLive && (
        <div className="h-full w-full animate-pulse rounded-lg bg-zinc-800/40" />
      )}

      {/* live layered card — reacts to setting changes in real time */}
      {showLive && (
        <div style={{ position: 'absolute', inset: 0, opacity: liveReady || !thumb.preview_url ? 1 : 0 }}>
          <LiveCardReady onReady={() => setLiveReady(true)}>
            <ThumbnailCard thumb={thumb} params={params} assets={assets} displayW={cw} phase={phase} showFrame={showFrame} />
          </LiveCardReady>
        </div>
      )}
    </div>
  )
}

/**
 * Signals when the live card's images have decoded, so we can cross-fade from
 * the WebP. Watches child <img> load events; if there are none (text logo /
 * no assets) it reports ready on mount.
 */
function LiveCardReady({ children, onReady }: { children: ReactNode; onReady: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const imgs = Array.from(el.querySelectorAll('img'))
    if (imgs.length === 0) {
      onReady()
      return
    }
    let left = imgs.length
    const done = () => {
      left -= 1
      if (left <= 0) onReady()
    }
    const cleanups: Array<() => void> = []
    for (const img of imgs) {
      if (img.complete && img.naturalWidth > 0) {
        done()
      } else {
        const onLoad = () => done()
        const onErr = () => done()
        img.addEventListener('load', onLoad)
        img.addEventListener('error', onErr)
        cleanups.push(() => {
          img.removeEventListener('load', onLoad)
          img.removeEventListener('error', onErr)
        })
      }
    }
    // Safety: never leave the WebP stuck if an event is missed.
    const t = setTimeout(onReady, 4000)
    return () => {
      cleanups.forEach((c) => c())
      clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return <div ref={ref} style={{ width: '100%', height: '100%' }}>{children}</div>
}
