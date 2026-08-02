/**
 * Small hand-drawn icon set, stroke-based to match the faceplate language
 * (silkscreened transport symbols, not filled glyphs). Every icon is a fixed
 * 24x24 viewBox so they drop into buttons without extra sizing math.
 */
type P = { className?: string; strokeWidth?: number }

const base = (strokeWidth = 1.75) => ({
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
})

export function PlayIcon({ className }: P) {
  return (
    <svg className={className} {...base()}>
      <path d="M7 5.5v13l11-6.5-11-6.5z" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function PauseIcon({ className }: P) {
  return (
    <svg className={className} {...base()}>
      <rect x="6.5" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none" />
      <rect x="13.5" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function NextIcon({ className }: P) {
  return (
    <svg className={className} {...base()}>
      <path d="M6 5.5v13l10-6.5-10-6.5z" fill="currentColor" stroke="none" />
      <rect x="17" y="5.5" width="2" height="13" rx="0.5" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function PrevIcon({ className }: P) {
  return (
    <svg className={className} {...base()}>
      <path d="M18 5.5v13L8 12l10-6.5z" fill="currentColor" stroke="none" />
      <rect x="5" y="5.5" width="2" height="13" rx="0.5" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function ShuffleIcon({ className }: P) {
  return (
    <svg className={className} {...base(1.6)}>
      <path d="M3 6h3.5l9 12H19M3 18h3.5l3-4M14.5 6H19" />
      <path d="M16.5 3.5 19 6l-2.5 2.5M16.5 20.5 19 18l-2.5-2.5" />
    </svg>
  )
}

export function RepeatIcon({ className, mode }: P & { mode?: 'off' | 'all' | 'one' }) {
  return (
    <svg className={className} {...base(1.6)}>
      <path d="M4 9V7a3 3 0 0 1 3-3h11" />
      <path d="M20 15v2a3 3 0 0 1-3 3H6" />
      <path d="m15 1 3 3-3 3" />
      <path d="m9 23-3-3 3-3" />
      {mode === 'one' && (
        <text x="12" y="14.5" textAnchor="middle" fontSize="8" fill="currentColor" stroke="none" fontFamily="ui-monospace, monospace">
          1
        </text>
      )}
    </svg>
  )
}

export function VolumeIcon({ className, level = 1 }: P & { level?: number }) {
  return (
    <svg className={className} {...base()}>
      <path d="M4 9.5v5h3.5L13 19V5L7.5 9.5H4z" fill="currentColor" stroke="none" />
      {level > 0.01 && <path d="M16.5 9a3.5 3.5 0 0 1 0 6" />}
      {level > 0.5 && <path d="M19 6.5a7 7 0 0 1 0 11" />}
    </svg>
  )
}

export function MuteIcon({ className }: P) {
  return (
    <svg className={className} {...base()}>
      <path d="M4 9.5v5h3.5L13 19V5L7.5 9.5H4z" fill="currentColor" stroke="none" />
      <path d="m16.5 9.5 5 5M21.5 9.5l-5 5" />
    </svg>
  )
}

export function SearchIcon({ className }: P) {
  return (
    <svg className={className} {...base()}>
      <circle cx="10.5" cy="10.5" r="6" />
      <path d="m20 20-4.5-4.5" />
    </svg>
  )
}

export function FolderIcon({ className }: P) {
  return (
    <svg className={className} {...base()}>
      <path d="M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2.5h8.5A1.5 1.5 0 0 1 21 9v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18V6.5z" />
    </svg>
  )
}

export function SunIcon({ className }: P) {
  return (
    <svg className={className} {...base(1.6)}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2.5 12h2M19.5 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" />
    </svg>
  )
}

export function MoonIcon({ className }: P) {
  return (
    <svg className={className} {...base(1.6)}>
      <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />
    </svg>
  )
}

export function ListIcon({ className }: P) {
  return (
    <svg className={className} {...base(1.6)}>
      <path d="M8 6h13M8 12h13M8 18h13" />
      <circle cx="3.5" cy="6" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="3.5" cy="12" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="3.5" cy="18" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function GridIcon({ className }: P) {
  return (
    <svg className={className} {...base(1.6)}>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1" />
    </svg>
  )
}

export function PlusIcon({ className }: P) {
  return (
    <svg className={className} {...base(1.8)}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

export function DiscIcon({ className }: P) {
  return (
    <svg className={className} {...base(1.4)}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="2.4" />
    </svg>
  )
}

export function CloseIcon({ className }: P) {
  return (
    <svg className={className} {...base(1.8)}>
      <path d="M5 5l14 14M19 5 5 19" />
    </svg>
  )
}
