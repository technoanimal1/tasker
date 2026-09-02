import { useEffect, useState, type CSSProperties } from 'react'
import { resolveColor } from '../lib/palettes'
import { computeOpaqueCenter, opaqueCenterCached, type Center } from '../lib/opaqueCenter'
import { ensureFont, layoutTextLogo, snapWeight } from '../lib/fonts'
import { motionFor, fxParticles, fxAdditive, NO_XFORM, type Particle, type Xform } from '../lib/animate'
import { AlphaVideo } from './AlphaVideo'
import {
  CORNER_MODES,
  CORNER_REF,
  applyCase,
  bandStops,
  frameSize,
  hexA,
  layoutBoxes,
  layerPlacement,
  baseFit,
  resolveGrad,
  type AssetUrls,
  type Placement,
  type FxLayer,
  FX_OFF,
  MO_OFF,
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

  // Image layers are placed by anchor + scale (drift-free); boxes remain for the
  // video layers and the text logo, which need a rectangle.
  const kvPlace = layout
    ? layerPlacement(layout.kvAlign, layout.kvScale, layout.kvDX ?? 0, layout.kvDY ?? 0, W, H, 'kv')
    : null
  const logoPlace = layout
    ? layerPlacement(layout.logoAlign, layout.logoScale, layout.logoDX ?? 0, layout.logoDY ?? 0, W, H, 'logo')
    : null
  const autoCenter = params.kvAutoCenter ?? true

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

  // Per-layer motion + effects. Defaulted so a params object that predates them
  // (or a branch override) can't crash the renderer.
  const fx = params.animFx ?? { bg: FX_OFF, kv: FX_OFF, logo: FX_OFF }
  const on = params.animEnabled
  const mo = params.animMo ?? { bg: MO_OFF, kv: MO_OFF, logo: MO_OFF }
  const mBg = on ? motionFor(mo.bg, phase) : NO_XFORM
  const mKv = on ? motionFor(mo.kv, phase) : NO_XFORM
  const mLogo = on ? motionFor(mo.logo, phase) : NO_XFORM
  // Bloom follows the key visual; the shine sweep belongs to whichever layer asked for it.
  const glow = Math.max(mBg.glow, mKv.glow, mLogo.glow)
  const shine = mLogo.shine ?? mKv.shine ?? mBg.shine
  const xf = (x: typeof mBg) =>
    `translate(${x.dx * W}px, ${x.dy * H}px) rotate(${x.rot}deg) scale(${x.sx}, ${x.sy})`

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
              transform: `translate(${mBg.dx * W}px, ${mBg.dy * H}px) scale(${params.bgScale * mBg.sx}, ${params.bgScale * mBg.sy}) rotate(${mBg.rot}deg)`,
              transformOrigin: 'center center',
            }}
          />
        )}

        {/* effect layer behind the art (over the background only) */}
        <ParticleLayer layer={fx.bg} phase={phase} W={W} H={H} />

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
              transform: xf(mKv),
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
              transform: xf(mKv),
            }}
          />
        ) : (
          kv &&
          (kvPlace ? (
            <Layer
              src={kv}
              place={kvPlace}
              autoCenter={autoCenter}
              W={W}
              H={H}
              extraTransform={xf(mKv)}
            />
          ) : (
            <FitImg src={kv} box={kvBox} transform={xf(mKv)} />
          ))
        )}

        {/* effect layer over the key visual (under the logo) */}
        <ParticleLayer layer={fx.kv} phase={phase} W={W} H={H} />

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
            transform: `translateX(-50%) scale(${1 + 0.25 * glow})`,
            opacity: 0.65 + 0.35 * glow,
            width: W * 0.811,
            height: H * 0.275,
            borderRadius: '50%',
            mixBlendMode: 'overlay',
            background: 'radial-gradient(closest-side, #ffffff, rgba(255,255,255,0) 70%)',
          }}
        />

        {/* logo — image or text variant. Placed like the KV: pinned on its
            visible mark and scaled about that point, so a logo file with uneven
            transparent padding can't slide sideways as its size grows. */}
        {params.textLogo
          ? renderTextLogo(thumb.name, params, logoBox, color, mLogo)
          : logo &&
            (logoPlace ? (
              <Layer
                src={logo}
                place={logoPlace}
                autoCenter={autoCenter}
                W={W}
                H={H}
                extraTransform={xf(mLogo)}
              />
            ) : (
              <FitImg src={logo} box={logoBox} />
            ))}

        {/* shine sweep */}
        {shine != null && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              pointerEvents: 'none',
              mixBlendMode: 'overlay',
              background: `linear-gradient(105deg, transparent ${shine * 140 - 30}%, rgba(255,255,255,0.55) ${shine * 140 - 18}%, transparent ${shine * 140 - 6}%)`,
            }}
          />
        )}

        {/* topmost effect layer — over the logo */}
        <ParticleLayer layer={fx.logo} phase={phase} W={W} H={H} />

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
 * One image layer, scaled from a pinned point.
 *
 * Laid out ONCE at k = 1 — a contain-fit inside the frame, computed from the
 * image and the frame only — with its origin sitting exactly on the anchor,
 * then scaled by a CSS transform about that same origin. A scale about a
 * transform-origin holds that origin still by definition, so the pinned point
 * cannot move at any size: resizing is pure zoom, never a drift.
 *
 * With `autoCenter` the pinned point is the artwork's visible centroid (so
 * uneven transparent padding doesn't offset it); otherwise it's the image's
 * geometric centre.
 */
function Layer({
  src,
  place,
  autoCenter,
  W,
  H,
  extraTransform,
}: {
  src: string
  place: Placement
  autoCenter: boolean
  W: number
  H: number
  extraTransform?: string
}) {
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null)
  const [ctr, setCtr] = useState<Center>(opaqueCenterCached(src) ?? { cx: 0.5, cy: 0.5 })
  useEffect(() => {
    let live = true
    // Reset on src change so a swap can never render the new image using the
    // previous one's dimensions or centre.
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

  if (!nat) return null
  const base = baseFit(nat.w, nat.h, W, H)
  const ox = autoCenter ? ctr.cx : 0.5
  const oy = autoCenter ? ctr.cy : 0.5
  return (
    <img
      src={src}
      draggable={false}
      loading="lazy"
      decoding="async"
      style={{
        position: 'absolute',
        left: place.ax - ox * base.w,
        top: place.ay - oy * base.h,
        width: base.w,
        height: base.h,
        transform: `${extraTransform ? extraTransform + ' ' : ''}scale(${place.k})`,
        transformOrigin: `${ox * 100}% ${oy * 100}%`,
      }}
    />
  )
}

/**
 * Draws the current frame's particles. Positions come from animate.ts, which is
 * a pure function of the loop phase, so this matches the exporter exactly.
 */
function ParticleLayer({ layer, phase, W, H }: { layer: FxLayer; phase: number; W: number; H: number }) {
  const parts = fxParticles(layer, phase)
  if (!parts.length) return null
  const unit = Math.min(W, H)
  const additive = fxAdditive(layer.fx)
  return (
    <div
      // `isolation` keeps the blending inside the card. The blend goes on each
      // PARTICLE, not the container: a container-level mix-blend-mode composites
      // the finished layer against the backdrop, so overlapping particles would
      // never build on each other — and canvas 'lighter' does exactly that, so
      // the preview would drift from the export.
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none', isolation: 'isolate' }}
    >
      {parts.map((p: Particle, i: number) => (
        <div key={i} style={{ ...particleStyle(p, unit, W, H), mixBlendMode: additive ? 'plus-lighter' : undefined }} />
      ))}
    </div>
  )
}

function particleStyle(p: Particle, unit: number, W: number, H: number): CSSProperties {
  const d = p.size * unit
  const base: CSSProperties = {
    position: 'absolute',
    left: p.x * W - d / 2,
    top: p.y * H - d / 2,
    width: d,
    height: d,
    opacity: p.opacity,
  }
  switch (p.kind) {
    case 'coin': {
      // A 3D-ish coin: the disc squashes by |flip| as it turns edge-on, the
      // face gradient swaps when you see the reverse, and a bright inset rim
      // reads as the coin's milled edge catching the light.
      const f = Math.abs(p.flip)
      const edgeOn = 1 - f // 1 when fully edge-on
      const front = p.flip >= 0
      return {
        ...base,
        borderRadius: '50%',
        transform: `rotate(${p.rot}rad) scaleX(${Math.max(0.06, f)}) scaleY(${1 - 0.12 * Math.abs(p.tilt)})`,
        background: front
          ? 'radial-gradient(circle at 34% 28%, #fff6c8 0%, #ffd54a 40%, #e8a911 74%, #b97d15 100%)'
          : 'radial-gradient(circle at 66% 72%, #f2d485 0%, #e0b431 42%, #bf8b12 76%, #8f6210 100%)',
        // inset ring = the coin's thickness; brightens as it turns edge-on
        boxShadow: `inset 0 0 0 ${d * 0.07}px rgba(255,244,190,${0.35 + 0.5 * edgeOn}), 0 0 ${d * (0.3 + 0.3 * edgeOn)}px rgba(255,196,60,${0.45 + 0.35 * edgeOn})`,
      }
    }
    case 'flame': {
      // A tall tongue: elongated, rounded-pill at the top, tapered at the base,
      // with a white-hot core that cools outward. Additive blending (set on the
      // layer) is what makes overlapping tongues build into a fire.
      const h = d * p.stretch
      return {
        ...base,
        height: h,
        top: p.y * H - h * 0.72, // anchor nearer the tongue's base
        borderRadius: '50% 50% 42% 42% / 62% 62% 38% 38%',
        background: `radial-gradient(ellipse 58% 52% at 50% 76%, hsla(${p.hue + 12},100%,${Math.min(98, p.light + 16)}%,0.98) 0%, hsla(${p.hue + 4},100%,${p.light}%,0.9) 30%, hsla(${p.hue - 12},100%,${Math.max(45, p.light - 20)}%,0.55) 58%, hsla(${p.hue - 24},100%,${Math.max(32, p.light - 34)}%,0.18) 80%, hsla(${p.hue - 30},100%,30%,0) 100%)`,
      }
    }
    case 'ember':
      return {
        ...base,
        borderRadius: '50%',
        background: `radial-gradient(circle, hsla(${p.hue},100%,72%,0.95) 0%, hsla(${p.hue},100%,55%,0.55) 45%, hsla(${p.hue},100%,45%,0) 72%)`,
      }
    case 'spark':
      return {
        ...base,
        transform: `rotate(${p.rot}rad)`,
        background: `radial-gradient(circle, hsla(${p.hue},100%,92%,1) 0%, hsla(${p.hue},100%,80%,0.5) 22%, hsla(${p.hue},100%,70%,0) 62%)`,
        // the cross that makes it read as a glint
        boxShadow: `0 0 ${d * 0.5}px hsla(${p.hue},100%,85%,0.9)`,
        clipPath:
          'polygon(50% 0%, 58% 42%, 100% 50%, 58% 58%, 50% 100%, 42% 58%, 0% 50%, 42% 42%)',
      }
    default: // confetti
      return {
        ...base,
        height: d * 0.6,
        top: p.y * H - d * 0.3,
        borderRadius: d * 0.12,
        transform: `rotate(${p.rot}rad) scaleY(${Math.max(0.15, Math.abs(Math.cos(p.rot * 0.7)))})`,
        background: `hsl(${p.hue}, 85%, 62%)`,
      }
  }
}

/** Plain contain-fit into a box — the legacy path for thumbnails that have no
 *  saved per-size layout yet (auto placement). */
function FitImg({ src, box, transform }: { src: string; box: { x: number; y: number; w: number; h: number }; transform?: string }) {
  return (
    <img
      src={src}
      draggable={false}
      loading="lazy"
      decoding="async"
      style={{ position: 'absolute', left: box.x, top: box.y, width: box.w, height: box.h, objectFit: 'contain', transform }}
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
  x: Xform = NO_XFORM,
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
        transform: `translate(${x.dx * boxW}px, ${x.dy * boxH}px) rotate(${x.rot}deg) scale(${x.sx}, ${x.sy})`,
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
