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
  kvRotDeg: number // key-visual rotation about its pinned point
  kvScaleMul: number // extra scale on the key visual
  bloomScale: number // extra scale on the overlay bloom
  bloomOpacity: number // 0..1 opacity of the overlay bloom
  logoScale: number // scale on the logo/text logo
  shine: number | null // 0..1 sweep position across the logo, or null
}

const STATIC: Motion = {
  bgScaleMul: 1,
  kvDXFrac: 0,
  kvDYFrac: 0,
  kvRotDeg: 0,
  kvScaleMul: 1,
  bloomScale: 1,
  bloomOpacity: 1,
  logoScale: 1,
  shine: null,
}

/** Compute motion for a given loop phase (0..1). Returns identity when off. */
export function motionAt(params: TemplateParams, phase: number): Motion {
  if (!params.animEnabled) return STATIC
  // Intensity runs past 1 so effects can be pushed to genuinely eye-catching.
  const k = Math.max(0, Math.min(2, params.animIntensity))
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
    // ── new motion presets ──────────────────────────────────────────────────
    case 'zoom': // punch-in on the key visual, background eases the other way
      return { ...STATIC, kvScaleMul: 1 + 0.14 * k * up, bgScaleMul: 1 + 0.05 * k * (1 - up), logoScale: 1 + 0.03 * k * up }
    case 'wiggle': // playful tilt
      return { ...STATIC, kvRotDeg: 3.5 * k * s, kvDXFrac: 0.008 * k * s }
    case 'bounce': // squash-and-stretch drop
      return { ...STATIC, kvDYFrac: -0.05 * k * Math.abs(s), kvScaleMul: 1 + 0.04 * k * up }
    case 'heartbeat': {
      // two quick beats per loop, then rest
      const b = phase < 0.5 ? Math.sin(tau * phase * 2) ** 2 : 0
      return { ...STATIC, kvScaleMul: 1 + 0.1 * k * b, bloomScale: 1 + 0.2 * k * b, logoScale: 1 + 0.04 * k * b }
    }
    // Particle presets keep a gentle base motion; the particles carry the show.
    case 'fire':
      return { ...STATIC, bloomScale: 1 + 0.12 * k * up, kvScaleMul: 1 + 0.012 * k * up }
    case 'sparkle':
      return { ...STATIC, bloomScale: 1 + 0.08 * k * up, shine: phase }
    case 'coins':
    case 'confetti':
      return { ...STATIC, kvDYFrac: -0.008 * k * s }
    default:
      return STATIC
  }
}

// ── particle effects ────────────────────────────────────────────────────────
//
// Particles are a PURE function of (preset, phase, index): no state, no RNG
// carried between frames. That's what lets the DOM preview and the canvas
// exporter draw byte-identical motion, and it makes every loop seamless —
// each particle's progress is frac(phase + offset), which is continuous across
// the 1 → 0 wrap.

export type ParticleKind = 'coin' | 'ember' | 'spark' | 'confetti'

export interface Particle {
  kind: ParticleKind
  x: number // 0..1 of frame width
  y: number // 0..1 of frame height
  size: number // fraction of the frame's shorter side
  rot: number // radians
  opacity: number // 0..1
  hue: number // degrees, for embers/confetti
}

export const PARTICLE_PRESETS = ['coins', 'fire', 'sparkle', 'confetti'] as const
export function isParticlePreset(p: string): boolean {
  return (PARTICLE_PRESETS as readonly string[]).includes(p)
}
/** Particles read best drawn additively (embers, sparkles). */
export function particlesAdditive(preset: string): boolean {
  return preset === 'fire' || preset === 'sparkle'
}

/** Stable pseudo-random in [0,1) for a particle index + salt. */
function rnd(i: number, salt: number): number {
  const x = Math.sin(i * 127.1 + salt * 311.7 + 0.5) * 43758.5453
  return x - Math.floor(x)
}
const frac = (v: number) => v - Math.floor(v)
/** Fade in/out at the ends of a particle's travel so nothing pops. */
const edgeFade = (t: number) => Math.max(0, Math.min(1, t / 0.1, (1 - t) / 0.1))

/** The particles to draw for this frame. Empty unless a particle preset is on. */
export function particlesAt(params: TemplateParams, phase: number): Particle[] {
  if (!params.animEnabled || !isParticlePreset(params.animPreset)) return []
  const k = Math.max(0, Math.min(2, params.animIntensity))
  const n = Math.max(0, Math.min(200, Math.round(params.animCount ?? 24)))
  const out: Particle[] = []
  for (let i = 0; i < n; i++) {
    const r1 = rnd(i, 1)
    const r2 = rnd(i, 2)
    const r3 = rnd(i, 3)
    const r4 = rnd(i, 4)
    const t = frac(phase + r1) // this particle's own 0..1 progress
    switch (params.animPreset) {
      case 'coins': {
        // tossed coins falling and tumbling, with a little lateral sway
        const sway = 0.04 * k * Math.sin((t * 4 + r2 * 6.283) * Math.PI)
        out.push({
          kind: 'coin',
          x: 0.04 + r2 * 0.92 + sway,
          y: -0.15 + t * 1.3,
          size: 0.05 + 0.05 * r3,
          rot: r4 * 6.283 + t * (6 + 10 * r3),
          opacity: edgeFade(t),
          hue: 45,
        })
        break
      }
      case 'fire': {
        // embers rising from the lower edge, shrinking and cooling as they go
        const drift = 0.07 * k * Math.sin((t * 3 + r2 * 6.283) * Math.PI)
        out.push({
          kind: 'ember',
          x: 0.06 + r2 * 0.88 + drift,
          y: 1.06 - t * (0.55 + 0.5 * r3),
          size: (0.012 + 0.022 * r3) * (1 - 0.55 * t),
          rot: 0,
          opacity: edgeFade(t) * (1 - 0.65 * t) * Math.min(1, k),
          hue: 18 + 34 * r4, // deep orange → yellow
        })
        break
      }
      case 'sparkle': {
        // twinkling glints at fixed spots, each on its own blink cycle
        const tw = 0.5 - 0.5 * Math.cos(frac(phase * (1 + Math.floor(r3 * 3)) + r1) * 6.283)
        out.push({
          kind: 'spark',
          x: 0.05 + r2 * 0.9,
          y: 0.05 + r3 * 0.9,
          size: (0.018 + 0.03 * r4) * (0.5 + 0.5 * tw),
          rot: r4 * Math.PI,
          opacity: tw * Math.min(1, k),
          hue: 48,
        })
        break
      }
      default: {
        // confetti: tumbling coloured chips
        const sway = 0.06 * k * Math.sin((t * 5 + r2 * 6.283) * Math.PI)
        out.push({
          kind: 'confetti',
          x: 0.04 + r2 * 0.92 + sway,
          y: -0.15 + t * 1.3,
          size: 0.018 + 0.024 * r3,
          rot: r4 * 6.283 + t * (8 + 12 * r3),
          opacity: edgeFade(t),
          hue: Math.floor(r4 * 360),
        })
        break
      }
    }
  }
  return out
}

/** Recommended export frame count for a smooth loop at the given fps. */
export function animFrameCount(params: TemplateParams, fps: number): number {
  return Math.max(2, Math.round(Math.max(0.5, params.animSpeed) * fps))
}
