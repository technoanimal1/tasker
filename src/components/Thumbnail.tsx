import { resolveColor } from '../lib/palettes'
import {
  CORNER_MODES,
  CORNER_REF,
  frameSize,
  hexA,
  type AssetUrls,
  type TemplateParams,
  type Thumbnail,
} from '../lib/thumb'

interface Props {
  thumb: Thumbnail
  params: TemplateParams
  assets: AssetUrls
  /** Display width in px; the frame scales to fit it (keeps ratio). */
  displayW?: number
  className?: string
}

export function ThumbnailCard({ thumb, params, assets, displayW = 244, className }: Props) {
  const size = frameSize(params.sizeKey)
  const W = size.w
  const H = size.h
  const scale = displayW / W

  const color = resolveColor(params.palette, params.colorKey)
  const bg = assets.bg
  const kv = assets.kv
  const logo = params.logoVariant === 'white' ? assets.logoWhite : assets.logoColor

  const radius = (CORNER_MODES[params.cornerMode] / CORNER_REF) * W
  const strokeW = Math.max(2, W * 0.006)

  // background — cover-fill, zoom (bgScale) grows the image from the centre
  const bgW = W * params.bgScale
  const bgH = H * params.bgScale
  const bgLeft = (W - bgW) / 2
  const bgTop = (H - bgH) / 2
  const pillRadius = (params.providerRadius / CORNER_REF) * W

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
            draggable={false}
            style={{ position: 'absolute', width: bgW, height: bgH, left: bgLeft, top: bgTop, objectFit: 'cover' }}
          />
        )}

        {/* subtle top darken for legibility */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(180deg, rgba(3,7,5,0.38) 0%, rgba(3,7,5,0) 30%)',
          }}
        />

        {/* key visual — centered, bottom-anchored */}
        {kv && (
          <img
            src={kv}
            draggable={false}
            style={{ position: 'absolute', left: 0, top: kvTop, width: W, height: kvBoxH, objectFit: 'contain' }}
          />
        )}

        {/* ── light effect (Figma control-area) ─────────────────────────── */}
        {/* shadow-color: bottom gradient band (bg-semantic 29.3% → bg-blur 74%) */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: H * 0.442,
            background: `linear-gradient(to bottom, ${color.semantic} 29.327%, ${color.blur} 74.038%)`,
          }}
        />
        {/* base bloom */}
        <div
          style={{
            position: 'absolute',
            left: '50%',
            bottom: -H * 0.05,
            transform: 'translateX(-50%)',
            width: W * 0.9,
            height: H * 0.34,
            borderRadius: '50%',
            background: `radial-gradient(closest-side, ${hexA(color.blur, 0.85)}, ${hexA(color.blur, 0)} 72%)`,
            filter: 'blur(2px)',
          }}
        />
        {/* bright overlay bloom (mix-blend-overlay) — the Ellipse */}
        <div
          style={{
            position: 'absolute',
            left: '50%',
            bottom: -H * 0.123,
            transform: 'translateX(-50%)',
            width: W * 0.811,
            height: H * 0.275,
            borderRadius: '50%',
            mixBlendMode: 'overlay',
            background: 'radial-gradient(closest-side, #ffffff, rgba(255,255,255,0) 70%)',
          }}
        />

        {/* logo — position + size, color/white variant */}
        {logo && (
          <img
            src={logo}
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
              ...(params.providerPos === 'top' ? { top: H * 0.035 } : { bottom: H * 0.035 }),
              transform: 'translateX(-50%)',
              background: color.blur,
              color: '#ffffff',
              font: `700 ${W * 0.05}px "Helvetica Neue", Arial, sans-serif`,
              letterSpacing: W * 0.001,
              padding: `${W * 0.016}px ${W * 0.06}px`,
              borderRadius: pillRadius,
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
