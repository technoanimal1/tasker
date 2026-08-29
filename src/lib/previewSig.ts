import type { TemplateParams, Thumbnail } from './thumb'

// Bump when the renderer (exportThumb drawFrame) changes in a way that alters
// pixels, so every cached preview is treated as stale and re-baked.
const RENDER_VERSION = 'v1'

/**
 * A short, stable signature of everything that affects a thumbnail's rendered
 * pixels: the fully-resolved params, the frame toggle, and the source
 * assets/name. Used to know when a baked preview is stale and must be re-baked.
 */
export function previewSig(params: TemplateParams, thumb: Thumbnail, showFrame: boolean): string {
  const src = JSON.stringify([
    RENDER_VERSION,
    params,
    showFrame,
    thumb.figma_bg_node,
    thumb.figma_kv_node,
    thumb.figma_logo_color_node,
    thumb.figma_logo_white_node,
    // Cached-asset state: when a layer is copied to our CDN (path goes from null
    // to a value) the rendered pixels change, so a preview baked before the
    // asset existed must be re-baked. Folding the paths in makes caching new
    // assets automatically invalidate any stale (blank) preview.
    thumb.bg_path ?? null,
    thumb.kv_path ?? null,
    thumb.logo_color_path ?? null,
    thumb.logo_white_path ?? null,
    thumb.logo_white_url ?? null,
    thumb.name,
    thumb.anim_video_url ?? null,
  ])
  // djb2 → unsigned base36 (compact, collision-safe enough for cache-busting)
  let h = 5381
  for (let i = 0; i < src.length; i++) h = (((h << 5) + h) + src.charCodeAt(i)) | 0
  return `${RENDER_VERSION}_${(h >>> 0).toString(36)}`
}
