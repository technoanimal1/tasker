import { storageUrl } from '../lib/supabase'
import { CARD_W, CARD_H, hexA, type TemplateParams, type Thumbnail } from '../lib/thumb'

interface Props {
  thumb: Thumbnail
  params: TemplateParams
  scale?: number
  className?: string
}

/**
 * Renders one thumbnail through the control-area template. Everything is laid
 * out on a fixed CARD_W×CARD_H canvas and scaled with a CSS transform, so the
 * same component serves both the grid (small) and the editor preview (large).
 */
export function ThumbnailCard({ thumb, params, scale = 1, className }: Props) {
  const bg = storageUrl(thumb.bg_path)
  const kv = storageUrl(thumb.kv_path)
  const logo = storageUrl(
    params.logoVariant === 'white' ? thumb.logo_white_path : thumb.logo_color_path,
  )
  const accent = thumb.accent_color || '#0c8022'

  const bgW = CARD_W * params.bgScale
  const bgH = CARD_H * params.bgScale
  const kvW = CARD_W * params.kvScale
  const kvH = CARD_H * params.kvScale

  return (
    <div className={className} style={{ width: CARD_W * scale, height: CARD_H * scale }}>
      <div
        style={{
          position: 'relative',
          width: CARD_W,
          height: CARD_H,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          borderRadius: params.cornerRadius,
          overflow: 'hidden',
          background: '#0a0f0c',
          boxShadow: `inset 0 0 0 2px ${accent}, 0 6px 24px ${hexA(accent, 0.35)}`,
        }}
      >
        {/* Background image — scalable, centered */}
        {bg && (
          <img
            src={bg}
            crossOrigin="anonymous"
            draggable={false}
            style={{
              position: 'absolute',
              width: bgW,
              height: bgH,
              left: (CARD_W - bgW) / 2 + params.bgOffsetX,
              top: (CARD_H - bgH) / 2 + params.bgOffsetY,
              objectFit: 'cover',
            }}
          />
        )}

        {/* Accent glow from the bottom + top darkening for legibility */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: `radial-gradient(135% 68% at 50% 116%, ${accent} 0%, ${hexA(accent, 0.55)} 34%, ${hexA(accent, 0)} 62%)`,
          }}
        />
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'linear-gradient(180deg, rgba(3,7,5,0.45) 0%, rgba(3,7,5,0) 28%, rgba(3,7,5,0) 58%, rgba(3,7,5,0.18) 100%)',
          }}
        />

        {/* Key visual — centered, scalable */}
        {kv && (
          <img
            src={kv}
            crossOrigin="anonymous"
            draggable={false}
            style={{
              position: 'absolute',
              width: kvW,
              height: kvH,
              left: (CARD_W - kvW) / 2,
              top: (CARD_H - kvH) / 2 + params.kvOffsetY,
              objectFit: 'contain',
            }}
          />
        )}

        {/* Logo — position + size, color/white variant */}
        {logo && (
          <img
            src={logo}
            crossOrigin="anonymous"
            draggable={false}
            style={{
              position: 'absolute',
              left: params.logo.x,
              top: params.logo.y,
              width: params.logo.w,
              height: params.logo.h,
              objectFit: 'contain',
            }}
          />
        )}

        {/* Provider label pill */}
        {params.showProvider && thumb.provider && (
          <div
            style={{
              position: 'absolute',
              left: '50%',
              bottom: 12,
              transform: 'translateX(-50%)',
              background: accent,
              color: '#ffffff',
              font: '700 12px "Helvetica Neue", Arial, sans-serif',
              letterSpacing: 0.3,
              padding: '4px 16px',
              borderRadius: 999,
              whiteSpace: 'nowrap',
              boxShadow: `0 0 16px ${hexA(accent, 0.7)}`,
            }}
          >
            {thumb.provider}
          </div>
        )}
      </div>
    </div>
  )
}
