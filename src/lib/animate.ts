import type { FxKind, FxLayer, MoLayer, TemplateParams } from './thumb'

/**
 * Per-layer motion.
 *
 * Each layer (background, key visual, logo) gets its own preset, so the art can
 * move as a composition rather than as one rigid block.
 *
 * ── What makes it read as real rather than "a sine wave" ────────────────────
 * 1. LOOP-SAFE NOISE. Organic drift comes from summed integer-frequency
 *    harmonics with fixed random phases. Because every frequency is a whole
 *    number of cycles per loop, the result is exactly periodic — but it wanders
 *    like noise instead of swinging like a metronome.
 * 2. REAL GRAVITY. Bounce is a parabola (constant acceleration) with a rest
 *    beat on the ground, not |sin|. Fast at the bottom, hangs at the top.
 * 3. SQUASH AND STRETCH. On impact the layer flattens and widens together, so
 *    it deforms like something with mass. The widening uses sx = 1/sqrt(sy) —
 *    the softer convention animators favour over strict area preservation
 *    (1/sy), which reads as too rubbery at these amplitudes.
 * 4. ANTICIPATION AND OVERSHOOT. A punch dips slightly the wrong way first,
 *    overshoots the target, then settles — the classic animation arc.
 * 5. DAMPED OSCILLATION. Wiggle is a decaying spring wobble, windowed to zero
 *    at the loop end so it never clicks at the wrap.
 * 6. FOLLOW-THROUGH. Each layer has `lag`, a phase offset, so the logo trails
 *    the key visual instead of moving in lockstep — the single cheapest trick
 *    for making a composition feel connected but alive.
 * Everything stays a pure function of phase, so the exporter matches exactly.
 */
export interface Xform {
  dx: number // translate, fraction of frame width
  dy: number // translate, fraction of frame height
  sx: number // horizontal scale
  sy: number // vertical scale
  rot: number // degrees
  glow: number // 0..1 extra bloom
  shine: number | null // 0..1 sweep position, or null
}

export const NO_XFORM: Xform = { dx: 0, dy: 0, sx: 1, sy: 1, rot: 0, glow: 0, shine: null }

const TAU = Math.PI * 2
const frac2 = (v: number) => v - Math.floor(v)
/** Distance between two phases on the loop circle (so effects wrap smoothly). */
const circDist = (a: number, b: number) => {
  const d = Math.abs(frac2(a) - frac2(b))
  return Math.min(d, 1 - d)
}
function hash1(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}
/**
 * Periodic value noise: harmonics at integer frequencies, so the period is
 * exactly 1 while the shape stays irregular. Returns roughly -1..1.
 */
function loopNoise(t: number, seed: number, octaves = 3): number {
  let v = 0
  let amp = 1
  let norm = 0
  for (let i = 0; i < octaves; i++) {
    const f = i + 1 // whole cycles per loop → seamless
    const ph = hash1(seed * 7.13 + i * 3.77)
    v += amp * Math.sin(TAU * (f * t + ph))
    norm += amp
    amp *= 0.55
  }
  return v / norm
}
/** Squash partner for a vertical scale. 1/sqrt (not 1/sy) keeps the deformation
 *  believable rather than rubbery at the amplitudes used here. */
const squash = (sy: number) => 1 / Math.sqrt(Math.max(0.05, sy))

/** Compute one layer's transform at this phase. */
export function motionFor(layer: MoLayer | undefined, phase: number): Xform {
  if (!layer || layer.mo === 'none') return NO_XFORM
  const k = Math.max(0, Math.min(2, layer.intensity))
  if (k === 0) return NO_XFORM
  const cycles = Math.max(1, Math.round(layer.cycles || 1))
  // `lag` shifts this layer back in the loop → follow-through between layers.
  const t = frac2(phase * cycles - (layer.lag ?? 0))
  const up = 0.5 - 0.5 * Math.cos(TAU * t) // 0..1..0

  switch (layer.mo) {
    case 'float': {
      // organic drift: noise, not a sine — never quite repeats within the loop
      return { ...NO_XFORM, dx: 0.012 * k * loopNoise(t, 1), dy: 0.022 * k * loopNoise(t, 2), rot: 0.8 * k * loopNoise(t, 3) }
    }
    case 'sway': {
      // pendulum: rotation leads, with a bob at double frequency (a real
      // pendulum's height peaks twice per swing)
      const a = Math.sin(TAU * t)
      return { ...NO_XFORM, rot: 4 * k * a, dx: 0.02 * k * a, dy: -0.008 * k * Math.abs(Math.cos(TAU * t)) }
    }
    case 'orbit': {
      // slow circular drift — good for backgrounds, adds depth without a beat
      return { ...NO_XFORM, dx: 0.018 * k * Math.cos(TAU * t), dy: 0.018 * k * Math.sin(TAU * t) }
    }
    case 'bounce': {
      // ballistic arc: constant gravity for the flight, then a rest beat
      const tf = 0.62 // fraction of the loop spent in the air
      let h = 0
      let vel = 0
      if (t < tf) {
        const u = t / tf
        h = 4 * u * (1 - u) // parabola: 0 → 1 → 0
        vel = 4 * (1 - 2 * u) // its derivative, for stretch
      }
      // squash at the two ground contacts (t≈0 and t≈tf), stretch in flight
      const imp = Math.max(0, 1 - Math.min(circDist(t, 0), circDist(t, tf)) / 0.05)
      const sy = 1 - 0.2 * k * imp + 0.07 * k * Math.abs(vel) * (1 - imp)
      return { ...NO_XFORM, dy: -0.13 * k * h, sy, sx: squash(sy) }
    }
    case 'zoom': {
      // anticipation → overshoot → settle
      const a = 0.18
      const v =
        t < a
          ? -0.35 * Math.sin((Math.PI * t) / a) // pull back first
          : Math.pow(Math.sin(Math.PI * ((t - a) / (1 - a))), 0.6) * Math.exp(-2.2 * ((t - a) / (1 - a)))
      const sc = 1 + 0.16 * k * v
      return { ...NO_XFORM, sx: sc, sy: sc, glow: Math.max(0, 0.5 * k * v) }
    }
    case 'wiggle': {
      // damped spring wobble, windowed to zero at the wrap so it can't click
      const env = Math.exp(-3.2 * t) * (1 - t)
      return { ...NO_XFORM, rot: 7 * k * env * Math.sin(TAU * 6 * t), dx: 0.01 * k * env * Math.sin(TAU * 6 * t) }
    }
    case 'heartbeat': {
      // two beats with a sharp attack, then rest — gaussians on the loop circle
      const beat = (c: number, w: number) => Math.exp(-(circDist(t, c) ** 2) / (w * w))
      const b = beat(0, 0.045) + 0.65 * beat(0.14, 0.04)
      const sc = 1 + 0.11 * k * b
      return { ...NO_XFORM, sx: sc, sy: sc, glow: 0.6 * k * b }
    }
    case 'pulse': {
      // breathing glow — gamma-shaped so the attack differs from the release
      const g = Math.pow(up, 1.8)
      return { ...NO_XFORM, glow: k * g, sx: 1 + 0.02 * k * g, sy: 1 + 0.02 * k * g }
    }
    case 'kenburns': {
      // slow push with a drifting centre, eased so it never sits still
      const e = up * up * (3 - 2 * up) // smoothstep
      return { ...NO_XFORM, sx: 1 + 0.14 * k * e, sy: 1 + 0.14 * k * e, dx: 0.02 * k * loopNoise(t, 5), dy: 0.015 * k * loopNoise(t, 6) }
    }
    default: {
      // shine: an eased sweep, with a small glow as it crosses
      const e = t * t * (3 - 2 * t)
      return { ...NO_XFORM, shine: e, glow: 0.35 * k * Math.exp(-((e - 0.5) ** 2) / 0.02) }
    }
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
  /** Signed face factor for a 3D coin: cos(spin). |flip| squashes the disc,
   *  its sign says which face you're looking at. */
  flip: number
  /** Secondary tumble axis, so a coin isn't a flat spinning disc. */
  tilt: number
}

/** Particles that read best drawn additively (embers, sparkles). */
export function fxAdditive(fx: FxKind): boolean {
  return fx === 'fire' || fx === 'sparkle'
}

/** Stable pseudo-random in [0,1) for a particle index + salt. */
function rnd(i: number, salt: number): number {
  const x = Math.sin(i * 127.1 + salt * 311.7 + 0.5) * 43758.5453
  return x - Math.floor(x)
}
const frac = (v: number) => v - Math.floor(v)
/** Fade in/out at the ends of a particle's travel so nothing pops. */
const edgeFade = (t: number) => Math.max(0, Math.min(1, t / 0.1, (1 - t) / 0.1))

/**
 * The particles for one effect layer at this frame.
 *
 * Pure in (layer, phase, index): no state, no RNG carried between frames. That
 * is what lets the DOM preview and the canvas exporter draw identical motion.
 * Each particle's progress is frac(phase * cycles + offset), which is
 * continuous across the 1 → 0 wrap, so every loop is seamless — `cycles` is an
 * integer for exactly that reason.
 */
export function fxParticles(layer: FxLayer, phase: number): Particle[] {
  if (!layer || layer.fx === 'none') return []
  const k = Math.max(0, Math.min(2, layer.intensity ?? 1))
  const n = Math.max(0, Math.min(300, Math.round(layer.count ?? 26)))
  const cycles = Math.max(1, Math.round(layer.cycles || 1))
  const sizeMul = Math.max(0.1, layer.size ?? 1)
  const speed = Math.max(0.15, layer.speed ?? 1)
  const drift = Math.max(0, layer.drift ?? 1)
  const tumble = Math.max(0, layer.tumble ?? 1)
  // Faster = a longer path covered in the same period. Start further outside
  // the frame and end further past it, which raises the velocity while the
  // period (and therefore the seamless loop) is untouched.
  const pad = 0.2 * speed
  const out: Particle[] = []
  for (let i = 0; i < n; i++) {
    const r1 = rnd(i, 1)
    const r2 = rnd(i, 2)
    const r3 = rnd(i, 3)
    const r4 = rnd(i, 4)
    const t = frac(phase * cycles + r1) // this particle's own 0..1 progress
    switch (layer.fx) {
      case 'coins': {
        // 3D coin shower: falls, sways, and tumbles about two axes
        const sway = 0.045 * drift * k * Math.sin((t * 4 + r2 * 6.283) * Math.PI)
        const spin = r4 * 6.283 + t * (6 + 10 * r3) * tumble
        out.push({
          kind: 'coin',
          x: 0.04 + r2 * 0.92 + sway,
          y: -pad + t * (1 + 2 * pad),
          size: (0.05 + 0.05 * r3) * sizeMul,
          rot: spin * 0.18, // slow in-plane roll, separate from the face flip
          opacity: edgeFade(t),
          hue: 45,
          flip: Math.cos(spin),
          tilt: Math.cos(spin * 0.37 + r2 * 6.283),
        })
        break
      }
      case 'fire': {
        // embers rising, shrinking and cooling as they go
        const swayF = 0.07 * drift * k * Math.sin((t * 3 + r2 * 6.283) * Math.PI)
        out.push({
          kind: 'ember',
          x: 0.06 + r2 * 0.88 + swayF,
          y: 1.06 - t * (0.55 + 0.5 * r3) * speed,
          size: (0.012 + 0.022 * r3) * sizeMul * (1 - 0.55 * t),
          rot: 0,
          opacity: edgeFade(t) * (1 - 0.65 * t) * Math.min(1, k),
          hue: 18 + 34 * r4,
          flip: 1,
          tilt: 0,
        })
        break
      }
      case 'sparkle': {
        // twinkling glints; the blink frequency stays a whole number of cycles
        const f = 1 + Math.floor(r3 * 3)
        const tw = 0.5 - 0.5 * Math.cos(frac(phase * cycles * f + r1) * 6.283)
        out.push({
          kind: 'spark',
          x: 0.05 + r2 * 0.9,
          y: 0.05 + r3 * 0.9,
          size: (0.018 + 0.03 * r4) * sizeMul * (0.5 + 0.5 * tw),
          rot: r4 * Math.PI,
          opacity: tw * Math.min(1, k),
          hue: 48,
          flip: 1,
          tilt: 0,
        })
        break
      }
      default: {
        // confetti: tumbling coloured chips
        const swayC = 0.065 * drift * k * Math.sin((t * 5 + r2 * 6.283) * Math.PI)
        const spinC = r4 * 6.283 + t * (8 + 12 * r3) * tumble
        out.push({
          kind: 'confetti',
          x: 0.04 + r2 * 0.92 + swayC,
          y: -pad + t * (1 + 2 * pad),
          size: (0.018 + 0.024 * r3) * sizeMul,
          rot: spinC,
          opacity: edgeFade(t),
          hue: Math.floor(r4 * 360),
          flip: Math.cos(spinC * 0.7),
          tilt: 0,
        })
        break
      }
    }
  }
  return out
}

/** True when any effect layer would draw something. */
export function hasFx(params: TemplateParams): boolean {
  const f = params.animFx
  return !!f && (f.bg.fx !== 'none' || f.kv.fx !== 'none' || f.logo.fx !== 'none')
}

/** Recommended export frame count for a smooth loop at the given fps. */
export function animFrameCount(params: TemplateParams, fps: number): number {
  return Math.max(2, Math.round(Math.max(0.5, params.animSpeed) * fps))
}
