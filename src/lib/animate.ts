import type { TemplateParams } from './thumb'

/**
 * Per-frame motion derived from a normalized loop phase (0..1). Shared by the
 * DOM preview (Thumbnail.tsx) and the canvas exporter so animation looks the
 * same on screen and in the exported file. All values are relative multipliers
 * / fractions applied on top of the static layout.
 */
export interface Motion {
  bgScaleMul: number // multiplies params.bgScale
  kvDXFrac: number // key-visual x shift, fraction of width
  kvDYFrac: number // key-visual y shift, fraction of height
  bloomScale: number // extra scale on the overlay bloom
  bloomOpacity: number // 0..1 opacity of the overlay bloom
  logoScale: number // scale on the logo/text logo
  shine: number | null // 0..1 sweep position across the logo, or null
}

const STATIC: Motion = {
  bgScaleMul: 1,
  kvDXFrac: 0,
  kvDYFrac: 0,
  bloomScale: 1,
  bloomOpacity: 1,
  logoScale: 1,
  shine: null,
}

/** Compute motion for a given loop phase (0..1). Returns identity when off. */
export function motionAt(params: TemplateParams, phase: number): Motion {
  if (!params.animEnabled) return STATIC
  const k = Math.max(0, Math.min(1, params.animIntensity))
  const tau = Math.PI * 2
  const s = Math.sin(tau * phase) // -1..1
  const up = 0.5 - 0.5 * Math.cos(tau * phase) // 0..1..0
  switch (params.animPreset) {
    case 'float':
      return { ...STATIC, kvDYFrac: -0.03 * k * s, logoScale: 1 + 0.015 * k * s }
    case 'pulse':
      return { ...STATIC, bloomScale: 1 + 0.25 * k * up, bloomOpacity: 1 - 0.35 * k * (1 - up) }
    case 'kenburns':
      return { ...STATIC, bgScaleMul: 1 + 0.12 * k * up, kvDXFrac: 0.01 * k * s }
    case 'shine':
      return { ...STATIC, shine: phase, bloomScale: 1 + 0.08 * k * up }
    default:
      return STATIC
  }
}

/** Recommended export frame count for a smooth loop at the given fps. */
export function animFrameCount(params: TemplateParams, fps: number): number {
  return Math.max(2, Math.round(Math.max(0.5, params.animSpeed) * fps))
}
