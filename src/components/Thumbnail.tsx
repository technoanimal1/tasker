import { useEffect, useState, type CSSProperties } from 'react'
import { resolveColor } from '../lib/palettes'
import { computeOpaqueCenter, opaqueCenterCached, type Center } from '../lib/opaqueCenter'
import { ensureFont, layoutTextLogo, snapWeight } from '../lib/fonts'
import { motionAt } from '../lib/animate'
import { AlphaVideo } from './AlphaVideo'
import {
  CORNER_MODES,
  CORNER_REF,
  applyCase,
  bandStops,
  frameSize,
  hexA,
  layoutBoxes,
  resolveGrad,
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
  /** Show the frame stroke + provider badge (the "frame" chrome). */
  showFrame?: boolean
  className?: string
}

export function ThumbnailCard({ thumb, params, assets, displayW = 244, phase = 0, showFrame = true, className }: Props) {
  const size = frameSize(params.sizeKey)
  const W = size.w
  const H = size.h
  const scale = displayW / W
  const k = W / CORNER_REF // px-at-244 → frame px

  const color = resolveColor(params.palette, params.colorKey)
  const bg = assets.bg
  const kv = assets.kv
  // White variant uses the clean server white logo; if a game has none yet, fall
  // back to its colour logo rather than a knockout blob.
  const logo = params.logoVariant === 'white' ? (assets.logoWhite ?? assets.logoColor) : assets.logoColor

  const radius = (CORNER_MODES[params.cornerMode] / CORNER_REF) * W
  const strokeW = params.strokeWidth * k
  const strokePad = params.strokePad * k
  const frameOn = showFrame && strokeW > 0
  // outside = matted: art insets so the stroke frames it (+ optional pad gap)
  const contentInset = frameOn && params.strokePos === 'outside' ? strokeW + strokePad : 0

  const kvBoxH = H * (params.kvSizePct / 100)
  // Width scales with the size too (not fixed to the frame width), so a KV that
  // has filled the frame width keeps growing instead of capping. Centered.
  const kvBoxW = W * (params.kvSizePct / 100)
  const kvTop = H - kvBoxH - H * (params.kvBottomPct / 100)

  // Layout: a saved per-size alignment layout wins; else auto (landscape splits
  // KV-left / logo-right, portrait stacks).
  const layout = params.layouts?.[params.sizeKey]
  const landscape = W / H > 1.2
  const kvBox = layout
    ? layoutBoxes(layout, W, H).kv
    : landscape
      ? { x: 0, y: H * 0.06, w: W * 0.52, h: H * 0.88 }
      : { x: (W - kvBoxW) / 2, y: kvTop, w: kvBoxW, h: kvBoxH }
  const logoBox = layout
    ? layoutBoxes(layout, W, H).logo
    : landscape
      ? { x: W * 0.5, y: H * 0.28, w: W * 0.46, h: H * 0.44 }
      : { x: params.logo.xPct * W, y: params.logo.yPct * H, w: params.logo.wPct * W, h: params.logo.hPct * H }

  const pr = params.providerRadius
  const provRadius = `${pr.tl * k}px ${pr.tr * k}px ${pr.br * k}px ${pr.bl * k}px`
  const grad = resolveGrad(params)
  // The light band can sit on any edge; its thickness is a % of the frame's
  // matching dimension (height for top/bottom, width for left/right), and the
  // gradient fades toward that edge.
  const bandVertical = grad.gradDir === 'top' || grad.gradDir === 'bottom'
  const bandExtent = (bandVertical ? H : W) * (grad.gradBandPct / 100)
  const bandStopsCss = bandStops(color.semantic, color.blur, grad)
    .map((s) => `${s.color} ${s.offset * 100}%`)
    .join(', ')
  const bandStyle: CSSProperties =
    grad.gradDir === 'bottom'
      ? { left: 0, right: 0, bottom: 0, height: bandExtent }
      : grad.gradDir === 'top'
        ? { left: 0, right: 0, top: 0, height: bandExtent }
        : grad.gradDir === 'left'
          ? { top: 0, bottom: 0, left: 0, width: bandExtent }
          : { top: 0, bottom: 0, right: 0, width: bandExtent }

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
          boxShadow: `0 6px 30px ${hexA(color.blur, 0.4)}`,
        }}
      >
        {/* content — clipped to the inner (matted) rect for outside strokes */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            clipPath: `inset(${contentInset}px round ${Math.max(0, radius - contentInset)}px)`,
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

        {/* key visual — an AI motion clip when present, else the still.
            Prefer the alpha-packed MP4 (transparent on every browser incl. iOS
            Safari); fall back to the transparent WebM (Chrome/Firefox), then the
            static image. */}
        {assets.animAlpha ? (
          <AlphaVideo
            src={assets.animAlpha}
            style={{
              position: 'absolute',
              left: kvBox.x,
              top: kvBox.y,
              width: kvBox.w,
              height: kvBox.h,
              objectFit: 'contain',
              transform: `translate(${m.kvDXFrac * W}px, ${m.kvDYFrac * H}px)`,
            }}
          />
        ) : assets.animVideo ? (
          <video
            src={assets.animVideo}
            autoPlay
            loop
            muted
            playsInline
            style={{
              position: 'absolute',
              left: kvBox.x,
              top: kvBox.y,
              width: kvBox.w,
              height: kvBox.h,
              objectFit: 'contain',
              transform: `translate(${m.kvDXFrac * W}px, ${m.kvDYFrac * H}px)`,
            }}
          />
        ) : (
          kv && (
            <ContainImg
              src={kv}
              box={kvBox}
              autoCenter={params.kvAutoCenter ?? true}
              transform={`translate(${m.kvDXFrac * W}px, ${m.kvDYFrac * H}px)`}
            />
          )
        )}

        {/* light effect (Figma control-area) — sits on the chosen edge */}
        <div
          style={{
            position: 'absolute',
            ...bandStyle,
            background: `linear-gradient(to ${grad.gradDir}, ${bandStopsCss})`,
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

        {/* logo — image or text variant. Rendered like the KV (ContainImg):
            centred on its visible mark, so a logo file with uneven transparent
            padding doesn't slide sideways as its size grows. */}
        {params.textLogo
          ? renderTextLogo(thumb.name, params, logoBox, color, m.logoScale)
          : logo && (
              <ContainImg
                src={logo}
                box={logoBox}
                autoCenter={params.kvAutoCenter ?? true}
                transform={m.logoScale !== 1 ? `scale(${m.logoScale})` : undefined}
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
        {params.showProvider && showFrame && (params.providerName.trim() || thumb.provider) && (
          <div
            style={{
              position: 'absolute',
              ...providerPlacement(params.providerPos, params.providerMarginX * k, params.providerMarginY * k),
              // Provider badge shares the frame's stroke colour (one colour drives both).
              background: color.stroke,
              color: '#ffffff',
              font: `700 ${W * 0.025 * params.providerScale}px "Helvetica Neue", Arial, sans-serif`,
              letterSpacing: W * 0.001,
              padding: `${params.providerPadY * k}px ${params.providerPadX * k}px ${(params.providerPadBottom ?? 0) * k}px`,
              borderRadius: provRadius,
              whiteSpace: 'nowrap',
              lineHeight: 1.15,
              // Center the text within the badge (both axes).
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              boxShadow: `0 0 ${W * 0.06}px ${hexA(color.stroke, 0.75)}`,
            }}
          >
            {applyCase(params.providerName.trim() || thumb.provider, params.providerCase ?? 'as-is')}
          </div>
        )}
        </div>
        {/* frame stroke — inset from the edge by strokePad */}
        {frameOn && (
          <div
            style={{
              position: 'absolute',
              inset: strokePad,
              border: `${strokeW}px solid ${color.stroke}`,
              borderRadius: Math.max(0, radius - strokePad),
              boxSizing: 'border-box',
              pointerEvents: 'none',
            }}
          />
        )}
      </div>
    </div>
  )
}

/**
 * Draws an image "contained" inside a box. With `autoCenter` it centres the
 * image's *visible artwork* (opaque pixels) on the box centre instead of its
 * transparent bounding box — so scaling the KV up keeps the subject put rather
 * than drifting when the source PNG has uneven padding. Falls back to plain
 * object-fit:contain until (or unless) the artwork centre is known.
 */
function ContainImg({
  src,
  box,
  autoCenter,
  transform,
}: {
  src: string
  box: { x: number; y: number; w: number; h: number }
  autoCenter: boolean
  transform?: string
}) {
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null)
  const [ctr, setCtr] = useState<Center>(opaqueCenterCached(src) ?? { cx: 0.5, cy: 0.5 })
  useEffect(() => {
    let live = true
    // Reset on src change so a swap can never render the new image with the
    // previous image's dimensions/centre (which would stretch or misplace it).
    setNat(null)
    setCtr(opaqueCenterCached(src) ?? { cx: 0.5, cy: 0.5 })
    const img = new Image()
    img.onload = () => live && setNat({ w: img.naturalWidth, h: img.naturalHeight })
    img.src = src
    if (autoCenter && !opaqueCenterCached(src)) {
      computeOpaqueCenter(src).then((r) => live && setCtr(r))
    }
    return () => {
      live = false
    }
  }, [src, autoCenter])

  const common: CSSProperties = { position: 'absolute', transform }
  if (!autoCenter || !nat) {
    return (
      <img
        src={src}
        draggable={false}
        loading="lazy"
        decoding="async"
        style={{ ...common, left: box.x, top: box.y, width: box.w, height: box.h, objectFit: 'contain' }}
      />
    )
  }
  const s = Math.min(box.w / nat.w, box.h / nat.h)
  const rw = nat.w * s
  const rh = nat.h * s
  const left = box.x + box.w / 2 - ctr.cx * rw
  const top = box.y + box.h / 2 - ctr.cy * rh
  return (
    <img
      src={src}
      draggable={false}
      loading="lazy"
      decoding="async"
      // objectFit is a no-op when rw/rh match the natural aspect (they do at
      // steady state) but guarantees no stretching during any transient.
      style={{ ...common, left, top, width: rw, height: rh, objectFit: 'contain' }}
    />
  )
}

function providerPlacement(pos: TemplateParams['providerPos'], mx: number, my: number): CSSProperties {
  const top = pos.startsWith('top')
  const v = top ? { top: my } : { bottom: my }
  if (pos === 'top' || pos === 'bottom') return { ...v, left: '50%', transform: 'translateX(-50%)' }
  return pos.endsWith('left') ? { ...v, left: mx } : { ...v, right: mx }
}

function renderTextLogo(
  name: string,
  params: TemplateParams,
  box: { x: number; y: number; w: number; h: number },
  color: { stroke: string; blur: string },
  scale = 1,
) {
  ensureFont(params.fontFamily)
  const boxW = box.w
  const boxH = box.h
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
        left: box.x,
        top: box.y,
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
        textShadow: params.textShadow ? `0 ${boxH * 0.02}px ${boxH * 0.06}px rgba(0,0,0,0.45)` : 'none',
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
