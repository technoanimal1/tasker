import { useEffect, useRef, useState, type ReactNode } from 'react'

/**
 * Renders `children` only once the box scrolls near the viewport, reserving its
 * exact w×h with a light skeleton until then. This keeps the thumbnail grid from
 * fetching every tile's Figma layers (bg + kv + logo) on load — only visible
 * tiles pull their images, the rest stay cheap placeholders until scrolled to.
 * Once shown it stays mounted (observer disconnects), so scrolling back is instant.
 */
export function LazyMount({
  w,
  h,
  rootMargin = '800px',
  children,
}: {
  w: number
  h: number
  rootMargin?: string
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (show) return
    const el = ref.current
    if (!el) return
    // No IntersectionObserver (very old browser) → just render.
    if (typeof IntersectionObserver === 'undefined') {
      setShow(true)
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShow(true)
          io.disconnect()
        }
      },
      { rootMargin },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [show, rootMargin])

  return (
    <div ref={ref} style={{ width: w, height: h }} className="grid place-items-center">
      {show ? children : <div className="h-full w-full animate-pulse rounded-pill bg-white/[0.04]" />}
    </div>
  )
}
