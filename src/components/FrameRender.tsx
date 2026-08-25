import type { CSSProperties } from 'react'
import type { AssetKind, Frame, Layer } from '../lib/types'

export function layerPositionStyle(l: Layer): CSSProperties {
  return {
    position: 'absolute',
    left: l.x,
    top: l.y,
    width: l.w,
    height: l.h,
    transform: `rotate(${l.rotation}deg)`,
    opacity: l.opacity,
    zIndex: l.z,
  }
}

export function LayerContent({ layer, assetUrl }: { layer: Layer; assetUrl?: string | null }) {
  if (layer.type === 'asset') {
    return assetUrl ? (
      <img
        src={assetUrl}
        alt=""
        draggable={false}
        crossOrigin="anonymous"
        style={{ width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none' }}
      />
    ) : (
      <div className="grid h-full w-full place-items-center border border-dashed border-zinc-500/60 text-[10px] text-zinc-400">
        {layer.assetKind} — no asset
      </div>
    )
  }

  if (layer.type === 'image') {
    return layer.src ? (
      <img
        src={layer.src}
        alt=""
        draggable={false}
        crossOrigin="anonymous"
        style={{ width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none' }}
      />
    ) : (
      <div className="grid h-full w-full place-items-center border border-dashed border-zinc-500/60 text-[10px] text-zinc-400">
        image — no URL
      </div>
    )
  }

  if (layer.type === 'text') {
    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent:
            layer.align === 'center' ? 'center' : layer.align === 'right' ? 'flex-end' : 'flex-start',
          color: layer.color,
          fontSize: layer.fontSize,
          fontWeight: layer.fontWeight,
          fontFamily: layer.fontFamily,
          textAlign: layer.align,
          lineHeight: 1.1,
          overflow: 'hidden',
          whiteSpace: 'pre-wrap',
          pointerEvents: 'none',
        }}
      >
        {layer.text}
      </div>
    )
  }

  return (
    <div
      style={{ width: '100%', height: '100%', background: layer.fill, borderRadius: layer.radius }}
    />
  )
}

/** Read-only render of a frame, scaled to `scale`. */
export function FrameRender({
  frame,
  resolve,
  scale = 1,
}: {
  frame: Frame
  resolve: (k: AssetKind) => string | null
  scale?: number
}) {
  return (
    <div
      style={{
        width: frame.width * scale,
        height: frame.height * scale,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'relative',
          width: frame.width,
          height: frame.height,
          background: frame.background_color,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
        }}
      >
        {[...frame.layout]
          .sort((a, b) => a.z - b.z)
          .map((l) => (
            <div key={l.id} style={layerPositionStyle(l)}>
              <LayerContent
                layer={l}
                assetUrl={l.type === 'asset' && l.assetKind ? resolve(l.assetKind) : null}
              />
            </div>
          ))}
      </div>
    </div>
  )
}
