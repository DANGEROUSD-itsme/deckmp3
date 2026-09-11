/** A single mp3 on disk, as we know it. */
export interface Track {
  /** Relative path from the library root, joined by "/". Stable across rescans. */
  id: string
  /** Path segments from the library root — used to re-resolve the file handle. */
  path: string[]
  title: string
  artist: string
  albumArtist: string
  album: string
  /** Seconds. 0 if we genuinely couldn't determine it. */
  duration: number
  trackNo: number | null
  discNo: number | null
  year: number | null
  genre: string | null
  /** Key into the `art` store. Shared by every track on the same album. */
  artKey: string | null
  /** Groups tracks into albums. `albumArtist — album`, lowercased. */
  albumKey: string
  addedAt: number
  size: number
  lastModified: number
}

/** An album, derived from tracks at runtime rather than stored. */
export interface Album {
  key: string
  title: string
  artist: string
  year: number | null
  artKey: string | null
  tracks: Track[]
  duration: number
  addedAt: number
}

export interface Playlist {
  id: string
  name: string
  trackIds: string[]
  createdAt: number
  updatedAt: number
}

export type RepeatMode = 'off' | 'all' | 'one'

/** What we restore on launch. */
export interface SavedState {
  trackId: string | null
  /** The queue as track ids, so a restored session resumes in context. */
  queue: string[]
  queueIndex: number
  position: number
  volume: number
  shuffle: boolean
  repeat: RepeatMode
}

export type SortKey = 'artist' | 'album' | 'title' | 'added'

export interface ScanProgress {
  phase: 'idle' | 'listing' | 'reading' | 'done' | 'error'
  found: number
  parsed: number
  file: string
  error?: string
}

/* ===========================================================================
   V2.01 — everything below arrived with the second-generation faceplate.
   Older saved rows never carry these fields, so anything persisted is either
   optional or has a documented default in `defaultSettings`.
   =========================================================================== */

/** Build identity, printed as silkscreen on the sidebar and in About. */
export const DECK_VERSION = '2.03'
export const DECK_CODENAME = 'Vibe Check'

/** Which surface the Now Playing well is rendering. */
export type VisualizerMode = 'ring' | 'bars' | 'wave' | 'orbit' | 'off'

export const VISUALIZER_MODES: { id: VisualizerMode; label: string; hint: string }[] = [
  { id: 'ring', label: 'Ring', hint: 'Instanced 3D spectrum ring' },
  { id: 'bars', label: 'Bars', hint: 'Classic log-band analyser' },
  { id: 'wave', label: 'Wave', hint: 'Raw oscilloscope trace' },
  { id: 'orbit', label: 'Orbit', hint: 'Particles driven by bass' },
  { id: 'off', label: 'Off', hint: 'Cover art only' },
]

/** The one accent colour that means "live". Six faceplate options. */
export type AccentName = 'signal' | 'ice' | 'lime' | 'violet' | 'gold' | 'rose'

export const ACCENTS: { id: AccentName; label: string; light: string; dark: string }[] = [
  { id: 'signal', label: 'Signal', light: '#d2481f', dark: '#ff6a3d' },
  { id: 'ice', label: 'Ice', light: '#0f6f92', dark: '#3fc4f0' },
  { id: 'lime', label: 'Lime', light: '#4c7a10', dark: '#a8e04a' },
  { id: 'violet', label: 'Violet', light: '#6435c9', dark: '#a98cff' },
  { id: 'gold', label: 'Gold', light: '#9a6b06', dark: '#f5c451' },
  { id: 'rose', label: 'Rose', light: '#b32155', dark: '#ff7aa8' },
]

export type ThemeMode = 'light' | 'dark' | 'system'
export type Density = 'comfortable' | 'compact'

/** Frequency centres of the graphic EQ, in Hz. Ten bands, ISO-ish spacing. */
export const EQ_FREQUENCIES = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]

export interface EqState {
  enabled: boolean
  /** Output trim in dB, -12..+12 — pull it down when boosting a lot. */
  preamp: number
  /** One gain per band in `EQ_FREQUENCIES`, dB, -12..+12. */
  bands: number[]
  /** Name of the preset last applied, or 'custom' once a slider moves. */
  preset: string
}

export const EQ_PRESETS: { name: string; bands: number[] }[] = [
  { name: 'Flat', bands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { name: 'Bass Boost', bands: [7, 6, 4.5, 2.5, 0, 0, 0, 0, 0, 0] },
  { name: 'Bass Cut', bands: [-7, -6, -4, -2, 0, 0, 0, 0, 0, 0] },
  { name: 'Treble Boost', bands: [0, 0, 0, 0, 0, 1.5, 3, 4.5, 6, 7] },
  { name: 'Loudness', bands: [6, 5, 2.5, 0, -1.5, -1, 0, 2.5, 5, 6] },
  { name: 'Vocal', bands: [-3, -2.5, -1, 2, 4.5, 5, 3.5, 1.5, 0, -1] },
  { name: 'Rock', bands: [5, 4, 2, -1, -2, -1, 2, 4, 5, 5] },
  { name: 'Jazz', bands: [3.5, 2.5, 1, 1.5, -1, -1, 0, 1.5, 3, 3.5] },
  { name: 'Electronic', bands: [5.5, 4.5, 1.5, 0, -2, 1.5, 1, 2, 4.5, 5.5] },
  { name: 'Classical', bands: [4, 3, 2, 1.5, -1, -1, 0, 2, 3, 3.5] },
  { name: 'Hip-Hop', bands: [6.5, 5.5, 2, 3, -1, -1, 1.5, 0, 2, 3] },
  { name: 'Podcast', bands: [-6, -4, -1, 3, 5, 5, 3.5, 1, -1, -3] },
]

export const defaultEq = (): EqState => ({
  enabled: false,
  preamp: 0,
  bands: EQ_FREQUENCIES.map(() => 0),
  preset: 'Flat',
})

/** Everything under Settings. Persisted whole, merged over defaults on load. */
export interface Settings {
  theme: ThemeMode
  accent: AccentName
  density: Density
  /** Seconds of overlap between tracks. 0 disables the crossfade entirely. */
  crossfade: number
  /** Multiply playback rate. 1 is normal. */
  rate: number
  /** Keep pitch constant as `rate` changes. Off gives the vinyl/tape
   *  behaviour Vibe Mode's slowed and nightcore presets want — pitch moves
   *  with speed — rather than transparent time-stretching. */
  pitchLock: boolean
  /** -1 hard left … 0 centre … +1 hard right. */
  balance: number
  /** Dynamic-range compressor — the "late night" switch. */
  nightMode: boolean
  /** Fade the master gain in and out instead of hard-cutting on pause. */
  smoothPause: boolean
  visualizer: VisualizerMode
  /** Tint the Now Playing backdrop with colour sampled from the cover. */
  ambientArt: boolean
  /** Keep the transport spectrum strip running. */
  spectrumStrip: boolean
  /** Animate list entries. Off is instant, for very large libraries. */
  listAnimation: boolean
  /** Skip a track after N seconds without it counting as a play. */
  scrobbleAt: number
  /** Show the album grid at this many pixels minimum per tile. */
  gridSize: number
  /** Restore the previous queue and playhead on launch. */
  resumeOnLaunch: boolean
  eq: EqState
  vibe: VibeState
}

export const defaultSettings = (): Settings => ({
  theme: 'dark',
  accent: 'signal',
  density: 'comfortable',
  crossfade: 0.14,
  rate: 1,
  pitchLock: true,
  balance: 0,
  nightMode: false,
  smoothPause: true,
  visualizer: 'ring',
  ambientArt: true,
  spectrumStrip: true,
  listAnimation: true,
  scrobbleAt: 20,
  gridSize: 168,
  resumeOnLaunch: true,
  eq: defaultEq(),
  vibe: defaultVibe(),
})

/** Per-track listening history. Written on play, never on scan. */
export interface TrackStats {
  id: string
  plays: number
  skips: number
  lastPlayed: number
  favorite: boolean
  /** 0 = unrated, 1..5 stars. */
  rating: number
}

export const emptyStats = (id: string): TrackStats => ({
  id,
  plays: 0,
  skips: 0,
  lastPlayed: 0,
  favorite: false,
  rating: 0,
})

/** An artist, derived from tracks at runtime like Album is. */
export interface Artist {
  name: string
  key: string
  tracks: Track[]
  albums: Album[]
  duration: number
  artKey: string | null
}

/** A named bucket in the sidebar that isn't a stored playlist. */
export type SmartViewId =
  | 'recent'
  | 'favorites'
  | 'mostPlayed'
  | 'neverPlayed'
  | 'lastPlayed'
  | 'top-rated'

export interface SmartView {
  id: SmartViewId
  name: string
  hint: string
}

export const SMART_VIEWS: SmartView[] = [
  { id: 'recent', name: 'Recently added', hint: 'Newest imports first' },
  { id: 'favorites', name: 'Favourites', hint: 'Everything you hearted' },
  { id: 'mostPlayed', name: 'Most played', hint: 'Your heaviest rotation' },
  { id: 'lastPlayed', name: 'Recently played', hint: 'Where you left off' },
  { id: 'top-rated', name: 'Top rated', hint: 'Four stars and up' },
  { id: 'neverPlayed', name: 'Never played', hint: 'Still shrink-wrapped' },
]

/** A queued toast. `kind` picks the icon and the accent on the left rule. */
export interface Toast {
  id: number
  message: string
  kind: 'info' | 'success' | 'error' | 'progress'
  /** Optional single action, e.g. "Undo". */
  action?: { label: string; run: () => void }
  /** ms. 0 keeps it up until dismissed. */
  ttl: number
}

/** A pending destructive confirmation. */
export interface Confirm {
  title: string
  body: string
  confirmLabel: string
  destructive: boolean
  run: () => void | Promise<void>
}

/** An A↔B repeat span inside the current track, in seconds. */
export interface LoopRange {
  a: number
  b: number | null
}

/** Sleep timer: either a wall-clock deadline or "stop at end of track". */
export interface SleepTimer {
  /** Epoch ms when playback should stop, or null in end-of-track mode. */
  endsAt: number | null
  endOfTrack: boolean
  minutes: number
}

/* ===========================================================================
   Vibe Mode. A second, always-on effects colour for ordinary listening,
   distinct from DJ mode's live two-deck mixing: one track, one set of
   effects, applied to everything that plays until you turn it off.
   =========================================================================== */

export interface VibeState {
  enabled: boolean
  /** Name of the preset last applied, or 'Custom' once a slider moves. */
  preset: string
  /** Wet mix of the reverb send, 0..1. */
  reverbWet: number
  /** Decay tail length, seconds. */
  reverbDecay: number
  /** Bitcrush/downsample amount, 0 (clean) .. 1 (8-bit gutter). */
  crush: number
  /** Waveshaper drive, 0 (clean) .. 1 (fuzzed out). */
  distortion: number
  /** Sweep filter: -1 (muffled/underwater) .. 0 (flat) .. 1 (thin/tinny). */
  filter: number
}

export const defaultVibe = (): VibeState => ({
  enabled: false,
  preset: 'Off',
  reverbWet: 0,
  reverbDecay: 2,
  crush: 0,
  distortion: 0,
  filter: 0,
})

/**
 * Rate and pitchLock ride on top of the existing `Settings.rate` speed
 * control rather than duplicating it — Vibe Mode's "Tempo" slider and the
 * Playback section's "Speed" slider are the same value on purpose, so
 * changing one is reflected in the other.
 */
export interface VibePreset {
  name: string
  rate: number
  pitchLock: boolean
  vibe: Omit<VibeState, 'preset'>
}

export const VIBE_PRESETS: VibePreset[] = [
  {
    name: 'Off',
    rate: 1,
    pitchLock: true,
    vibe: { enabled: false, reverbWet: 0, reverbDecay: 2, crush: 0, distortion: 0, filter: 0 },
  },
  {
    name: 'Slowed + Reverb',
    rate: 0.82,
    pitchLock: false,
    vibe: { enabled: true, reverbWet: 0.55, reverbDecay: 3.2, crush: 0, distortion: 0, filter: -0.1 },
  },
  {
    name: 'Nightcore',
    rate: 1.28,
    pitchLock: false,
    vibe: { enabled: true, reverbWet: 0.08, reverbDecay: 0.8, crush: 0, distortion: 0, filter: 0 },
  },
  {
    name: 'Chopped & Screwed',
    rate: 0.68,
    pitchLock: false,
    vibe: { enabled: true, reverbWet: 0.35, reverbDecay: 2.5, crush: 0.1, distortion: 0, filter: -0.15 },
  },
  {
    name: '8-Bit',
    rate: 1,
    pitchLock: true,
    vibe: { enabled: true, reverbWet: 0, reverbDecay: 1, crush: 0.75, distortion: 0.15, filter: 0 },
  },
  {
    name: 'Distorted',
    rate: 1,
    pitchLock: true,
    vibe: { enabled: true, reverbWet: 0.05, reverbDecay: 1.5, crush: 0.1, distortion: 0.65, filter: 0 },
  },
  {
    name: 'Underwater',
    rate: 0.95,
    pitchLock: true,
    vibe: { enabled: true, reverbWet: 0.4, reverbDecay: 4, crush: 0, distortion: 0, filter: -0.55 },
  },
  {
    name: 'Telephone',
    rate: 1,
    pitchLock: true,
    vibe: { enabled: true, reverbWet: 0, reverbDecay: 1, crush: 0.3, distortion: 0.1, filter: 0.35 },
  },
]
