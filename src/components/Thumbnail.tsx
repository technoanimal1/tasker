import { storageUrl } from '../lib/supabase'
import { resolveColor } from '../lib/palettes'
import {
  CORNER_MODES,
  CORNER_REF,
  frameSize,
  hexA,
  type TemplateParams,
  type Thumbnail,
} from '../lib/thumb'

interface Props {
  thumb: Thumbnail
  params: TemplateParams
  /** Display width in px; the frame scales to fit it (keeps ratio). */
  displayW?: number
  className?: string
}

export function ThumbnailCard({ thumb, params, displayW = 244, className }: Props) {
  const size = frameSize(params.sizeKey)
  const W = size.w
  const H = size.h
  const scale = displayW / W

  const color = resolveColor(params.palette, params.colorKey)
  const bg = storageUrl(thumb.bg_path)
  const kv = storageUrl(thumb.kv_path)
  const logo = storageUrl(
    params.logoVariant === 'white' ? thumb.logo_white_path : thumb.logo_color_path,
  )

  const radius = (CORNER_MODES[params.cornerMode] / CORNER_REF) * W
  const strokeW = Math.max(2, W * 0.006)

  // background — always cover-fill, bgScale zooms further
  const bgW = W * params.bgScale
  const bgH = H * params.bgScale
  // key visual — height = kvSizePct% of frame, bottom-anchored, centered
  const kvBoxH = H * (params.kvSizePct / 100)
  const kvTop = H - kvBoxH - H * (params.kvBottomPct / 100)

  return (
    <div className={className} style={{ width: W * scale, height: H * scale }}>
      <div
        style={{
          position: 'relative',
          width: W,
          height: H,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          borderRadius: radius,
          overflow: 'hidden',
          background: '#0a0f0c',
          boxShadow: `inset 0 0 0 ${strokeW}px ${color.stroke}, 0 6px 30px ${hexA(color.blur, 0.4)}`,
        }}
      >
        {bg && (
          <img
            src={bg}
            crossOrigin="anonymous"
            draggable={false}
            style={{
              position: 'absolute',
              width: bgW,
              height: bgH,
              left: (W - bgW) / 2 + params.bgOffsetXPct * W,
              top: (H - bgH) / 2 + params.bgOffsetYPct * H,
              objectFit: 'cover',
            }}
          />
        )}

        {/* colour glow from bottom + top darken */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: `radial-gradient(140% 62% at 50% 118%, ${color.blur} 0%, ${color.semantic} 30%, ${hexA(color.blur, 0)} 60%)`,
          }}
        />
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'linear-gradient(180deg, rgba(3,7,5,0.42) 0%, rgba(3,7,5,0) 26%, rgba(3,7,5,0) 60%, rgba(3,7,5,0.15) 100%)',
          }}
        />

        {kv && (
          <img
            src={kv}
            crossOrigin="anonymous"
            draggable={false}
            style={{
              position: 'absolute',
              left: 0,
              top: kvTop,
              width: W,
              height: kvBoxH,
              objectFit: 'contain',
            }}
          />
        )}

        {logo && (
          <img
            src={logo}
            crossOrigin="anonymous"
            draggable={false}
            style={{
              position: 'absolute',
              left: params.logo.xPct * W,
              top: params.logo.yPct * H,
              width: params.logo.wPct * W,
              height: params.logo.hPct * H,
              objectFit: 'contain',
            }}
          />
        )}

        {params.showProvider && thumb.provider && (
          <div
            style={{
              position: 'absolute',
              left: '50%',
              bottom: H * 0.035,
              transform: 'translateX(-50%)',
              background: color.blur,
              color: '#ffffff',
              font: `700 ${W * 0.05}px "Helvetica Neue", Arial, sans-serif`,
              letterSpacing: W * 0.001,
              padding: `${W * 0.016}px ${W * 0.06}px`,
              borderRadius: 999,
              whiteSpace: 'nowrap',
              boxShadow: `0 0 ${W * 0.06}px ${hexA(color.blur, 0.75)}`,
            }}
          >
            {thumb.provider}
          </div>
        )}
      </div>
    </div>
  )
}
