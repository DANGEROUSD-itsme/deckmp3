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

/* ===========================================================================
   V2.01 — the second bank of silkscreen. Same 24×24 grid, same stroke weight.
   =========================================================================== */

export function HeartIcon({ className, filled = false }: P & { filled?: boolean }) {
  return (
    <svg className={className} {...base(1.7)}>
      <path
        d="M12 20.5C6.5 16.8 3.5 13.7 3.5 10.2A4.7 4.7 0 0 1 12 7.3a4.7 4.7 0 0 1 8.5 2.9c0 3.5-3 6.6-8.5 10.3z"
        fill={filled ? 'currentColor' : 'none'}
      />
    </svg>
  )
}

export function StarIcon({ className, filled = false }: P & { filled?: boolean }) {
  return (
    <svg className={className} {...base(1.5)}>
      <path
        d="m12 3.6 2.6 5.4 5.9.8-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9L3.5 9.8l5.9-.8L12 3.6z"
        fill={filled ? 'currentColor' : 'none'}
      />
    </svg>
  )
}

export function QueueIcon({ className }: P) {
  return (
    <svg className={className} {...base(1.6)}>
      <path d="M3.5 6h11M3.5 11h11M3.5 16h7" />
      <path d="M17 12.5v7l5-3.5-5-3.5z" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function SlidersIcon({ className }: P) {
  return (
    <svg className={className} {...base(1.6)}>
      <path d="M6 20V14M6 10V4M12 20v-8M12 8V4M18 20v-4M18 12V4" />
      <circle cx="6" cy="12" r="2" fill="currentColor" stroke="none" />
      <circle cx="12" cy="10" r="2" fill="currentColor" stroke="none" />
      <circle cx="18" cy="14" r="2" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function GearIcon({ className }: P) {
  // A toothed cog, not a radial burst — at 18px a spoked circle is
  // indistinguishable from the sun icon two rows above it in the sidebar.
  return (
    <svg className={className} {...base(1.5)}>
      <path d="M10.3 3.2a1 1 0 0 1 1-.85h1.4a1 1 0 0 1 1 .85l.2 1.4a7.4 7.4 0 0 1 1.7.98l1.32-.53a1 1 0 0 1 1.24.43l.7 1.2a1 1 0 0 1-.23 1.28l-1.11.9a7.5 7.5 0 0 1 0 1.96l1.11.9a1 1 0 0 1 .23 1.29l-.7 1.2a1 1 0 0 1-1.24.43l-1.32-.54a7.4 7.4 0 0 1-1.7.99l-.2 1.4a1 1 0 0 1-1 .84h-1.4a1 1 0 0 1-1-.84l-.2-1.4a7.4 7.4 0 0 1-1.7-.99l-1.32.54a1 1 0 0 1-1.24-.43l-.7-1.2a1 1 0 0 1 .23-1.29l1.11-.9a7.5 7.5 0 0 1 0-1.95l-1.11-.9a1 1 0 0 1-.23-1.29l.7-1.2a1 1 0 0 1 1.24-.43l1.32.53a7.4 7.4 0 0 1 1.7-.98l.2-1.4z" />
      <circle cx="12" cy="12" r="2.7" />
    </svg>
  )
}

export function KeyboardIcon({ className }: P) {
  return (
    <svg className={className} {...base(1.5)}>
      <rect x="2.5" y="6" width="19" height="12" rx="2" />
      <path d="M6 9.5h.01M9.5 9.5h.01M13 9.5h.01M16.5 9.5h.01M6 13h.01M18 13h.01M9 16h6" />
      <path d="M9.5 13h5" />
    </svg>
  )
}

export function InfoIcon({ className }: P) {
  return (
    <svg className={className} {...base(1.6)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5.5" />
      <circle cx="12" cy="7.8" r="1" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function ChartIcon({ className }: P) {
  return (
    <svg className={className} {...base(1.6)}>
      <path d="M4 20V11M10 20V4M16 20v-6M22 20H2" />
    </svg>
  )
}

export function MoreIcon({ className }: P) {
  return (
    <svg className={className} {...base()}>
      <circle cx="5.5" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="18.5" cy="12" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function CommandIcon({ className }: P) {
  return (
    <svg className={className} {...base(1.6)}>
      <path d="M9 6a2.5 2.5 0 1 0-2.5 2.5H9V6zM15 6a2.5 2.5 0 1 1 2.5 2.5H15V6zM9 18a2.5 2.5 0 1 1-2.5-2.5H9V18zM15 18a2.5 2.5 0 1 0 2.5-2.5H15V18z" />
      <rect x="9" y="9" width="6" height="6" rx="0.6" />
    </svg>
  )
}

export function MoonStarsIcon({ className }: P) {
  return (
    <svg className={className} {...base(1.55)}>
      <path d="M19.5 15A7.5 7.5 0 1 1 9.6 5.2 6 6 0 0 0 19.5 15z" />
      <path d="M17 3.5v2.6M15.7 4.8h2.6" />
    </svg>
  )
}

export function TimerIcon({ className }: P) {
  return (
    <svg className={className} {...base(1.6)}>
      <circle cx="12" cy="13.5" r="7.5" />
      <path d="M12 9.5v4.2l2.6 1.7M9.5 2.5h5" />
    </svg>
  )
}

export function LoopIcon({ className, armed = false }: P & { armed?: boolean }) {
  return (
    <svg className={className} {...base(1.6)}>
      <path d="M4 9V7.5A3.5 3.5 0 0 1 7.5 4H16" />
      <path d="M20 15v1.5a3.5 3.5 0 0 1-3.5 3.5H8" />
      <path d="m14 1.5 3 2.5-3 2.5M10 22.5 7 20l3-2.5" />
      {armed && (
        <text
          x="12"
          y="14.6"
          textAnchor="middle"
          fontSize="7.5"
          fill="currentColor"
          stroke="none"
          fontFamily="ui-monospace, monospace"
        >
          AB
        </text>
      )}
    </svg>
  )
}

export function SpeedIcon({ className }: P) {
  return (
    <svg className={className} {...base(1.6)}>
      <path d="M4.5 17.5a8.5 8.5 0 1 1 15 0" />
      <path d="m12 13.5 4-4" />
      <circle cx="12" cy="14" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function WaveIcon({ className }: P) {
  return (
    <svg className={className} {...base(1.7)}>
      <path d="M2 12h2.5l2-6 3 12 3-14 3 16 2.5-8H22" />
    </svg>
  )
}

export function UserIcon({ className }: P) {
  return (
    <svg className={className} {...base(1.6)}>
      <circle cx="12" cy="8.5" r="3.8" />
      <path d="M4.8 20.5a7.5 7.5 0 0 1 14.4 0" />
    </svg>
  )
}

export function TagIcon({ className }: P) {
  return (
    <svg className={className} {...base(1.6)}>
      <path d="M3.5 11.3V4.5a1 1 0 0 1 1-1h6.8a1 1 0 0 1 .7.3l8.2 8.2a1 1 0 0 1 0 1.4l-6.8 6.8a1 1 0 0 1-1.4 0L3.8 12a1 1 0 0 1-.3-.7z" />
      <circle cx="8" cy="8" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function ClockIcon({ className }: P) {
  return (
    <svg className={className} {...base(1.6)}>
      <circle cx="12" cy="12" r="8.8" />
      <path d="M12 7v5.3l3.4 2" />
    </svg>
  )
}

export function SparkIcon({ className }: P) {
  return (
    <svg className={className} {...base(1.5)}>
      <path d="M12 3.5 13.7 9l5.5 1.7-5.5 1.7L12 18l-1.7-5.6L4.8 10.7 10.3 9 12 3.5z" fill="currentColor" stroke="none" />
      <path d="M18.5 16.5 19.2 18.6l2.1.7-2.1.7-.7 2.1-.7-2.1-2.1-.7 2.1-.7.7-2.1z" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function TrashIcon({ className }: P) {
  return (
    <svg className={className} {...base(1.6)}>
      <path d="M4.5 6.5h15M9.5 6.5V4.8a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v1.7" />
      <path d="M6.5 6.5 7.4 19a1.6 1.6 0 0 0 1.6 1.5h6a1.6 1.6 0 0 0 1.6-1.5l.9-12.5" />
      <path d="M10.5 10v6.5M13.5 10v6.5" />
    </svg>
  )
}

export function DownloadIcon({ className }: P) {
  return (
    <svg className={className} {...base(1.6)}>
      <path d="M12 3.5v11M7.8 10.6 12 14.8l4.2-4.2" />
      <path d="M4.5 16.5v2.2a1.8 1.8 0 0 0 1.8 1.8h11.4a1.8 1.8 0 0 0 1.8-1.8v-2.2" />
    </svg>
  )
}

export function UploadIcon({ className }: P) {
  return (
    <svg className={className} {...base(1.6)}>
      <path d="M12 15V4M7.8 8.2 12 4l4.2 4.2" />
      <path d="M4.5 16.5v2.2a1.8 1.8 0 0 0 1.8 1.8h11.4a1.8 1.8 0 0 0 1.8-1.8v-2.2" />
    </svg>
  )
}

export function CopyIcon({ className }: P) {
  return (
    <svg className={className} {...base(1.6)}>
      <rect x="8.5" y="8.5" width="11" height="11" rx="1.8" />
      <path d="M15.5 5.5V4.8a1.3 1.3 0 0 0-1.3-1.3H5.8A1.3 1.3 0 0 0 4.5 4.8v8.4a1.3 1.3 0 0 0 1.3 1.3h.7" />
    </svg>
  )
}

export function CheckIcon({ className }: P) {
  return (
    <svg className={className} {...base(2)}>
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </svg>
  )
}

export function AlertIcon({ className }: P) {
  return (
    <svg className={className} {...base(1.7)}>
      <path d="M12 3.8 21.2 19.5a1 1 0 0 1-.87 1.5H3.67a1 1 0 0 1-.87-1.5L12 3.8z" />
      <path d="M12 9.8v4.4" />
      <circle cx="12" cy="17.2" r="1" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function ChevronIcon({ className, dir = 'right' }: P & { dir?: 'up' | 'down' | 'left' | 'right' }) {
  const rotation = { right: 0, down: 90, left: 180, up: 270 }[dir]
  return (
    <svg className={className} {...base(1.8)} style={{ transform: `rotate(${rotation}deg)` }}>
      <path d="m9.5 5.5 6.5 6.5-6.5 6.5" />
    </svg>
  )
}

export function AddToQueueIcon({ className }: P) {
  return (
    <svg className={className} {...base(1.6)}>
      <path d="M3.5 6.5h12M3.5 11.5h12M3.5 16.5h7" />
      <path d="M18.5 12.5v7M15 16h7" />
    </svg>
  )
}

export function PlayNextIcon({ className }: P) {
  return (
    <svg className={className} {...base(1.6)}>
      <path d="M3.5 6.5h9M3.5 16.5h9M3.5 11.5h6" />
      <path d="M15 8.5v7l5.5-3.5L15 8.5z" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function BalanceIcon({ className }: P) {
  return (
    <svg className={className} {...base(1.6)}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 3.5v17" />
      <path d="M8.2 9.5v5M15.8 9.5v5" />
    </svg>
  )
}

export function CompressIcon({ className }: P) {
  return (
    <svg className={className} {...base(1.6)}>
      <path d="M3 12h18" />
      <path d="M7.5 7.5 12 3l4.5 4.5M7.5 16.5 12 21l4.5-4.5" />
    </svg>
  )
}

export function LayersIcon({ className }: P) {
  return (
    <svg className={className} {...base(1.55)}>
      <path d="m12 3.2 8.5 4.5L12 12.2 3.5 7.7 12 3.2z" />
      <path d="m3.5 12 8.5 4.5 8.5-4.5M3.5 16.3 12 20.8l8.5-4.5" />
    </svg>
  )
}

export function RefreshIcon({ className }: P) {
  return (
    <svg className={className} {...base(1.65)}>
      <path d="M20.2 11a8.3 8.3 0 0 0-14.4-4M3.8 13a8.3 8.3 0 0 0 14.4 4" />
      <path d="M20.5 4.5V11h-6.2M3.5 19.5V13h6.2" />
    </svg>
  )
}
