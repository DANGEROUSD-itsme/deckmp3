/**
 * Single-pitch (monophonic) detection via YIN (de Cheveigné & Kawahara,
 * 2002) — the core primitive Hum to Find is built on. Works on one frame of
 * time-domain samples and returns the fundamental frequency in Hz, or
 * `null` when the frame isn't clearly pitched (silence, noise, percussion).
 *
 * This is the textbook algorithm: a difference function (how well the
 * signal correlates with a delayed copy of itself at each lag), normalized
 * by its running mean so quiet/loud frames behave the same, then the first
 * dip below a threshold is taken as the period — refined with parabolic
 * interpolation so the result isn't quantized to whole samples.
 */

export interface PitchOptions {
  /** Dip-below-this-and-stop threshold on the normalized difference function. Lower = stricter. */
  threshold?: number
  /** Ignore periods shorter than this many Hz above — i.e. the highest frequency considered. */
  minHz?: number
  /** Ignore periods below this frequency — the lowest frequency considered. */
  maxHz?: number
}

const DEFAULTS: Required<PitchOptions> = {
  threshold: 0.15,
  minHz: 70, // below typical hum/vocal range
  maxHz: 1000, // above typical hum/vocal range
}

/**
 * `frame` should be centered, DC-free samples (silence subtracted out isn't
 * required — YIN's difference function is insensitive to DC offset). Returns
 * `null` for unvoiced/silent/ambiguous frames rather than a guess, since a
 * wrong note is worse than a gap in the contour.
 */
export function detectPitch(
  frame: Float32Array,
  sampleRate: number,
  options: PitchOptions = {}
): number | null {
  const { threshold, minHz, maxHz } = { ...DEFAULTS, ...options }
  const n = frame.length
  const maxTau = Math.min(n >> 1, Math.floor(sampleRate / minHz))
  const minTau = Math.max(2, Math.floor(sampleRate / maxHz))
  if (maxTau <= minTau + 2) return null

  // Quick silence gate — the difference function on near-zero audio can dip
  // below threshold at spurious lags, which otherwise reads as a confident
  // (wrong) pitch.
  let energy = 0
  for (let i = 0; i < n; i++) energy += frame[i] * frame[i]
  if (energy / n < 1e-6) return null

  // The difference function and its cumulative-mean normalization must both
  // start at tau=1 to get the right curve shape — only the *search* for a
  // dip below threshold should skip ahead to minTau (the highest plausible
  // frequency). Starting the normalization itself at minTau (an earlier,
  // buggy version of this) skews the whole curve and biases every detected
  // frequency high.
  const diff = new Float32Array(maxTau)
  for (let tau = 1; tau < maxTau; tau++) {
    let sum = 0
    for (let i = 0; i < maxTau; i++) {
      const d = frame[i] - frame[i + tau]
      sum += d * d
    }
    diff[tau] = sum
  }

  const cmnd = new Float32Array(maxTau)
  cmnd[0] = 1
  let runningSum = 0
  for (let tau = 1; tau < maxTau; tau++) {
    runningSum += diff[tau]
    cmnd[tau] = runningSum > 0 ? (diff[tau] * tau) / runningSum : 1
  }

  let tauEstimate = -1
  for (let tau = minTau; tau < maxTau; tau++) {
    if (cmnd[tau] < threshold) {
      while (tau + 1 < maxTau && cmnd[tau + 1] < cmnd[tau]) tau++
      tauEstimate = tau
      break
    }
  }
  if (tauEstimate === -1) return null

  // Parabolic interpolation around the chosen minimum for sub-sample precision.
  const t = tauEstimate
  const prev = t > minTau ? cmnd[t - 1] : cmnd[t]
  const next = t + 1 < maxTau ? cmnd[t + 1] : cmnd[t]
  const denom = 2 * (prev - 2 * cmnd[t] + next)
  const shift = denom !== 0 ? (prev - next) / denom : 0
  const refinedTau = t + Math.max(-1, Math.min(1, shift))

  if (refinedTau <= 0) return null
  const hz = sampleRate / refinedTau
  if (hz < minHz || hz > maxHz) return null
  return hz
}

/** Converts a frequency in Hz to a continuous MIDI note number (A4 = 69). */
export function hzToMidi(hz: number): number {
  return 69 + 12 * Math.log2(hz / 440)
}
