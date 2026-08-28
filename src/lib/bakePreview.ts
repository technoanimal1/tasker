import { renderThumbBlob } from './exportThumb'
import { supabase } from './supabase'
import { frameSize, type TemplateParams, type Thumbnail } from './thumb'

// Grid tiles render up to ~320px wide; bake at 480px so they stay crisp on
// hi-dpi without bloating the file. WebP keeps these ~15-40KB each.
const PREVIEW_W = 480

/**
 * Render the thumbnail to a small flat WebP (identical draw code to export, so
 * no drift), upload it to the public `previews` bucket, and return a
 * signature-busted public URL. Requires designer write access (RLS).
 */
export async function bakeUploadPreview(thumb: Thumbnail, params: TemplateParams, sig: string): Promise<string> {
  const size = frameSize(params.sizeKey)
  const mult = Math.min(1, PREVIEW_W / size.w)
  const blob = await renderThumbBlob(thumb, params, mult, 'webp')
  const path = `${thumb.id}.webp`
  const { error } = await supabase.storage.from('previews').upload(path, blob, {
    upsert: true,
    contentType: blob.type || 'image/webp',
    cacheControl: '31536000',
  })
  if (error) throw error
  const { data } = supabase.storage.from('previews').getPublicUrl(path)
  // The path is stable (upsert), so bust the CDN/browser cache by signature.
  return `${data.publicUrl}?v=${sig}`
}

// ── throttled bake queue ──────────────────────────────────────────────────────
// Baking loads the full-res Figma layers, so cap concurrency to keep the tab
// responsive while the visible grid populates its cache in the background.
const MAX_CONCURRENT = 2
let active = 0
const queue: Array<() => void> = []

function pump() {
  while (active < MAX_CONCURRENT && queue.length) {
    const job = queue.shift()!
    active++
    job()
  }
}

/** Schedule a bake task; resolves/rejects are handled by the caller's fn. */
export function enqueueBake(fn: () => Promise<void>): void {
  queue.push(() => {
    fn().finally(() => {
      active--
      pump()
    })
  })
  pump()
}
