import { resolveColor } from '../lib/palettes'
import { ensureFont, layoutTextLogo, snapWeight } from '../lib/fonts'
import { motionAt } from '../lib/animate'
import {
  CORNER_MODES,
  CORNER_REF,
  bandStops,
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
  /** Animation loop phase 0..1 (drives motion when params.animEnabled). */
  phase?: number
  className?: string
}

export function ThumbnailCard({ thumb, params, assets, displayW = 244, phase = 0, className }: Props) {
  const size = frameSize(params.sizeKey)
  const W = size.w
  const H = size.h
  const scale = displayW / W
  const k = W / CORNER_REF // px-at-244 → frame px

  const color = resolveColor(params.palette, params.colorKey)
  const bg = assets.bg
  const kv = assets.kv
  const logo = params.logoVariant === 'white' ? assets.logoWhite : assets.logoColor

  const radius = (CORNER_MODES[params.cornerMode] / CORNER_REF) * W
  const strokeW = Math.max(2, W * 0.006)

  const kvBoxH = H * (params.kvSizePct / 100)
  const kvTop = H - kvBoxH - H * (params.kvBottomPct / 100)

  const pr = params.providerRadius
  const provRadius = `${pr.tl * k}px ${pr.tr * k}px ${pr.br * k}px ${pr.bl * k}px`
  const bandH = H * (params.gradBandPct / 100)

  const m = motionAt(params, phase)

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
        {/* background — cover-fills the whole frame, centered; zoom scales from centre.
            Uses background-image (not <img>) so it can never leave an uncovered edge. */}
        {bg && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              backgroundImage: `url("${bg}")`,
              backgroundSize: 'cover',
              backgroundPosition: 'center center',
              backgroundRepeat: 'no-repeat',
              transform: `scale(${params.bgScale * m.bgScaleMul})`,
              transformOrigin: 'center center',
            }}
          />
        )}

        {/* subtle top darken */}
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
            style={{
              position: 'absolute',
              left: 0,
              top: kvTop,
              width: W,
              height: kvBoxH,
              objectFit: 'contain',
              transform: `translate(${m.kvDXFrac * W}px, ${m.kvDYFrac * H}px)`,
            }}
          />
        )}

        {/* light effect (Figma control-area) */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: bandH,
            background: `linear-gradient(to bottom, ${bandStops(color.semantic, color.blur, params)
              .map((s) => `${s.color} ${s.offset * 100}%`)
              .join(', ')})`,
          }}
        />
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
        <div
          style={{
            position: 'absolute',
            left: '50%',
            bottom: -H * 0.123,
            transform: `translateX(-50%) scale(${m.bloomScale})`,
            opacity: m.bloomOpacity,
            width: W * 0.811,
            height: H * 0.275,
            borderRadius: '50%',
            mixBlendMode: 'overlay',
            background: 'radial-gradient(closest-side, #ffffff, rgba(255,255,255,0) 70%)',
          }}
        />

        {/* logo — image or text variant */}
        {params.textLogo
          ? renderTextLogo(thumb.name, params, W, H, color, m.logoScale)
          : logo && (
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
                  transform: `scale(${m.logoScale})`,
                  transformOrigin: 'center center',
                }}
              />
            )}

        {/* shine sweep */}
        {m.shine != null && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              pointerEvents: 'none',
              mixBlendMode: 'overlay',
              background: `linear-gradient(105deg, transparent ${m.shine * 140 - 30}%, rgba(255,255,255,0.55) ${m.shine * 140 - 18}%, transparent ${m.shine * 140 - 6}%)`,
            }}
          />
        )}

        {/* provider label */}
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
              padding: `${params.providerPadY * k}px ${params.providerPadX * k}px 0`,
              borderRadius: provRadius,
              whiteSpace: 'nowrap',
              lineHeight: 1.15,
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

function renderTextLogo(
  name: string,
  params: TemplateParams,
  W: number,
  H: number,
  color: { stroke: string; blur: string },
  scale = 1,
) {
  ensureFont(params.fontFamily)
  const boxW = params.logo.wPct * W
  const boxH = params.logo.hPct * H
  const weight = snapWeight(params.fontFamily, params.textWeight)
  const { lines, lineSizes, lineHeight } = layoutTextLogo(name, params.fontFamily, boxW, boxH, {
    weight,
    maxLines: params.textMaxLines,
    lineHeight: params.textLineHeight,
    scale: params.textScale,
    fillLines: params.textFillLines,
    allCaps: params.textAllCaps,
  })
  const fill =
    params.textColorMode === 'white' ? '#ffffff' : params.textColorMode === 'custom' ? params.textColor : color.stroke
  const alignItems = params.textAlign === 'left' ? 'flex-start' : params.textAlign === 'right' ? 'flex-end' : 'center'
  return (
    <div
      style={{
        position: 'absolute',
        left: params.logo.xPct * W,
        top: params.logo.yPct * H,
        width: boxW,
        height: boxH,
        display: 'flex',
        flexDirection: 'column',
        alignItems,
        justifyContent: 'center',
        textAlign: params.textAlign,
        fontFamily: `"${params.fontFamily}", "Helvetica Neue", Arial, sans-serif`,
        fontWeight: weight,
        lineHeight: lineHeight,
        color: fill,
        textShadow: params.textShadow ? `0 ${H * 0.006}px ${H * 0.02}px rgba(0,0,0,0.45)` : 'none',
        whiteSpace: 'nowrap',
        overflow: 'visible',
        transform: `scale(${scale})`,
        transformOrigin: 'center center',
      }}
    >
      {lines.map((l, i) => (
        <span key={i} style={{ display: 'block', fontSize: lineSizes[i], letterSpacing: lineSizes[i] * (params.textLetterPct / 100) }}>
          {l}
        </span>
      ))}
    </div>
  )
}
