import { useEffect, useRef, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { CloseIcon } from './icons'

/* ---------------------------------------------------------------------------
   Shared chrome. Every overlay in DECK is one of these three shapes: a Sheet
   (centred card), a Drawer (edge panel), or a Dialog (small, modal, blocking).
   Keeping them here means one implementation of the escape key, the scrim, the
   focus return, and the scroll lock rather than seven slightly different ones.
   --------------------------------------------------------------------------- */

const EASE = [0.22, 1, 0.36, 1] as const

/**
 * A stack of the overlays currently mounted, innermost last.
 *
 * Every overlay listens for Escape on `document`, and stopPropagation does
 * nothing between two listeners bound to the same node — so without this, a
 * confirm dialog opened from inside a settings sheet would close both. Only
 * the overlay on top of the stack acts on the key.
 */
const overlayStack: symbol[] = []

/**
 * Close on Escape, trap Tab inside the overlay, and hand focus back to
 * whatever was focused when it opened. Without the last part, closing a panel
 * with the keyboard drops focus onto <body> and the next Tab starts from the
 * top of the page.
 */
export function useOverlay(onClose: () => void, active = true) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!active) return
    const opener = document.activeElement as HTMLElement | null
    const token = Symbol('overlay')
    overlayStack.push(token)

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (overlayStack[overlayStack.length - 1] !== token) return
        e.stopPropagation()
        onClose()
        return
      }
      if (e.key !== 'Tab' || !ref.current) return
      const focusable = ref.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKey, true)
    // Stop the page behind the overlay scrolling under the finger.
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    // Focus the first control so the keyboard lands somewhere useful, but not
    // if the overlay has already claimed focus itself (a search field, say).
    const timer = window.setTimeout(() => {
      if (ref.current && !ref.current.contains(document.activeElement)) {
        ref.current.querySelector<HTMLElement>('[data-autofocus]')?.focus()
      }
    }, 40)

    return () => {
      document.removeEventListener('keydown', onKey, true)
      document.body.style.overflow = prevOverflow
      window.clearTimeout(timer)
      const at = overlayStack.indexOf(token)
      if (at !== -1) overlayStack.splice(at, 1)
      opener?.focus?.()
    }
  }, [active, onClose])

  return ref
}

/** The dimmed backdrop. Clicking it closes; it never captures the scroll. */
export function Scrim({ onClose, blur = true }: { onClose: () => void; blur?: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      onClick={onClose}
      className="absolute inset-0"
      style={{
        background: 'var(--scrim)',
        backdropFilter: blur ? 'blur(3px)' : undefined,
        WebkitBackdropFilter: blur ? 'blur(3px)' : undefined,
      }}
    />
  )
}

interface SheetProps {
  title: string
  subtitle?: string
  icon?: ReactNode
  onClose: () => void
  children: ReactNode
  /** Tailwind max-width class. Defaults to a comfortable reading column. */
  width?: string
  footer?: ReactNode
}

/** A centred modal card — settings, equalizer, about, stats. */
export function Sheet({
  title,
  subtitle,
  icon,
  onClose,
  children,
  width = 'sm:max-w-lg',
  footer,
}: SheetProps) {
  const ref = useOverlay(onClose)
  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-6">
      <Scrim onClose={onClose} />
      <motion.div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        initial={{ opacity: 0, y: 40, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 24, scale: 0.98 }}
        transition={{ duration: 0.34, ease: EASE }}
        className={`relative w-full ${width} max-h-[88vh] sm:max-h-[85vh] flex flex-col glass raise-lg border border-line rounded-t-2xl sm:rounded-xl overflow-hidden`}
      >
        {/* Grab handle — only meaningful on the mobile bottom-sheet layout. */}
        <div className="sm:hidden pt-2.5 pb-1 grid place-items-center shrink-0">
          <div className="w-9 h-1 rounded-full bg-line" />
        </div>

        <header className="shrink-0 flex items-start gap-3 px-5 sm:px-6 pt-4 pb-3.5 border-b border-line">
          {icon && (
            <span className="w-9 h-9 shrink-0 rounded-lg bg-surface grid place-items-center text-signal">
              {icon}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <h2 className="display-wide text-lg leading-tight truncate">{title}</h2>
            {subtitle && <p className="label mt-1 normal-case tracking-normal">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="control-btn w-8 h-8 shrink-0" aria-label="Close">
            <CloseIcon className="w-4 h-4" />
          </button>
        </header>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 sm:px-6 py-4">{children}</div>

        {footer && (
          <footer className="shrink-0 px-5 sm:px-6 py-3 border-t border-line flex items-center justify-end gap-2">
            {footer}
          </footer>
        )}
      </motion.div>
    </div>
  )
}

/** An edge-anchored panel — the queue lives here. */
export function Drawer({
  title,
  subtitle,
  icon,
  onClose,
  children,
  footer,
}: Omit<SheetProps, 'width'>) {
  const ref = useOverlay(onClose)
  return (
    <div className="fixed inset-0 z-[70] flex justify-end">
      <Scrim onClose={onClose} />
      <motion.aside
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ duration: 0.36, ease: EASE }}
        className="relative w-full sm:w-[400px] h-full flex flex-col glass border-l border-line raise-lg"
      >
        <header className="shrink-0 flex items-start gap-3 px-5 pt-5 pb-3.5 border-b border-line">
          {icon && (
            <span className="w-9 h-9 shrink-0 rounded-lg bg-surface grid place-items-center text-signal">
              {icon}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <h2 className="display-wide text-lg leading-tight truncate">{title}</h2>
            {subtitle && <p className="label mt-1 normal-case tracking-normal">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="control-btn w-8 h-8 shrink-0" aria-label="Close">
            <CloseIcon className="w-4 h-4" />
          </button>
        </header>
        <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3">{children}</div>
        {footer && (
          <footer className="shrink-0 px-4 py-3 border-t border-line flex items-center gap-2">
            {footer}
          </footer>
        )}
      </motion.aside>
    </div>
  )
}

/* ------------------------------------------------------------- primitives -- */

export function Toggle({
  on,
  onChange,
  label,
}: {
  on: boolean
  onChange: (v: boolean) => void
  label: string
}) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={`switch ${on ? 'switch-on' : ''}`}
    />
  )
}

/**
 * A horizontal slider built on pointer events rather than <input type=range>,
 * so the fill, the readout and the accent stay consistent with the faceplate
 * and the touch target can be taller than the visible track.
 */
export function Slider({
  value,
  min,
  max,
  step = 0.01,
  onChange,
  label,
  format,
  /** Double-click / double-tap snaps back to this. */
  resetTo,
  accent = true,
}: {
  value: number
  min: number
  max: number
  step?: number
  onChange: (v: number) => void
  label: string
  format?: (v: number) => string
  resetTo?: number
  accent?: boolean
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const ratio = max === min ? 0 : (value - min) / (max - min)

  const apply = (clientX: number) => {
    const el = trackRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const r = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    const raw = min + r * (max - min)
    onChange(Math.round(raw / step) * step)
  }

  return (
    <div className="flex items-center gap-3 min-w-0 flex-1">
      <div
        ref={trackRef}
        role="slider"
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
            e.preventDefault()
            onChange(Math.max(min, value - step))
          } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
            e.preventDefault()
            onChange(Math.min(max, value + step))
          } else if (e.key === 'Home') {
            e.preventDefault()
            onChange(min)
          } else if (e.key === 'End') {
            e.preventDefault()
            onChange(max)
          }
        }}
        onDoubleClick={() => resetTo !== undefined && onChange(resetTo)}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          apply(e.clientX)
        }}
        onPointerMove={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) apply(e.clientX)
        }}
        onPointerUp={(e) => e.currentTarget.releasePointerCapture(e.pointerId)}
        className="relative flex-1 h-7 flex items-center cursor-pointer touch-none group outline-none"
      >
        <div className="absolute inset-x-0 h-[3px] rounded-full bg-line" />
        <div
          className={`absolute left-0 h-[3px] rounded-full ${accent ? 'bg-signal' : 'bg-ink-dim'}`}
          style={{ width: `${ratio * 100}%` }}
        />
        <div
          className={`absolute h-3.5 w-3.5 rounded-full ${accent ? 'bg-signal' : 'bg-ink'} shadow-[0_1px_3px_rgb(0_0_0/0.4)] transition-transform group-hover:scale-115 group-focus-visible:scale-115`}
          style={{ left: `calc(${ratio * 100}% - 7px)` }}
        />
      </div>
      {format && (
        <span className="readout label !text-[10px] w-12 text-right shrink-0 tabular-nums">
          {format(value)}
        </span>
      )}
    </div>
  )
}

/** A row of mutually-exclusive options, laid out as a segmented control. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T
  options: { id: T; label: string; icon?: ReactNode }[]
  onChange: (v: T) => void
  label: string
}) {
  return (
    <div className="segment" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.id}
          role="radio"
          aria-checked={value === o.id}
          onClick={() => onChange(o.id)}
          className={`segment-item ${value === o.id ? 'segment-item-active' : ''}`}
        >
          {value === o.id && (
            <motion.span
              layoutId={`segment-${label}`}
              transition={{ type: 'spring', stiffness: 480, damping: 38 }}
              className="absolute inset-0 rounded-full bg-panel raise"
            />
          )}
          <span className="relative z-10 flex items-center gap-1.5">
            {o.icon}
            {o.label}
          </span>
        </button>
      ))}
    </div>
  )
}

/** A settings line: name + description on the left, control on the right. */
export function Row({
  title,
  hint,
  children,
}: {
  title: string
  hint?: string
  children: ReactNode
}) {
  return (
    <div className="setting-row">
      <div className="min-w-0 flex-1">
        <p className="text-sm leading-tight">{title}</p>
        {hint && <p className="label mt-1 normal-case tracking-normal leading-snug">{hint}</p>}
      </div>
      {/* The control column has to be able to grow, or a flex-1 Slider inside
          a shrink-0 parent collapses to nothing. */}
      <div className="flex items-center justify-end gap-2 min-w-0 flex-1 max-w-[52%]">
        {children}
      </div>
    </div>
  )
}

/** Section heading inside a panel. */
export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 mt-6 first:mt-0 mb-1">
      <span className="label">{children}</span>
      <span className="flex-1 rule" />
    </div>
  )
}
