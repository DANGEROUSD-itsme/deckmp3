import { useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useDeck } from '../store/deck'
import type { Toast } from '../types'
import { AlertIcon, CheckIcon, CloseIcon, InfoIcon } from './icons'

/**
 * The toast stack. Sits above the transport bar rather than at the top of the
 * window, because that's where the user's attention already is when they've
 * just pressed something.
 */
export function Toasts() {
  const { toasts } = useDeck()
  return (
    <div className="fixed bottom-[calc(var(--transport-height,96px)+12px)] left-1/2 -translate-x-1/2 z-[65] flex flex-col items-center gap-2 pointer-events-none px-4 w-full max-w-md">
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <ToastRow key={t.id} toast={t} />
        ))}
      </AnimatePresence>
    </div>
  )
}

const ICONS: Record<Toast['kind'], React.ReactNode> = {
  info: <InfoIcon className="w-4 h-4" />,
  success: <CheckIcon className="w-4 h-4" />,
  error: <AlertIcon className="w-4 h-4" />,
  progress: <InfoIcon className="w-4 h-4" />,
}

function ToastRow({ toast }: { toast: Toast }) {
  const { dismissToast } = useDeck()

  useEffect(() => {
    if (!toast.ttl) return
    const t = window.setTimeout(() => dismissToast(toast.id), toast.ttl)
    return () => window.clearTimeout(t)
  }, [dismissToast, toast.id, toast.ttl])

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 14, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 6, scale: 0.97, transition: { duration: 0.16 } }}
      transition={{ type: 'spring', stiffness: 420, damping: 32 }}
      role="status"
      className="pointer-events-auto w-full glass raise-lg border border-line rounded-lg pl-3 pr-2 py-2.5 flex items-center gap-3 overflow-hidden relative"
    >
      {/* Kind is carried by a rule on the left, not by colouring the whole card. */}
      <span
        className="absolute left-0 inset-y-0 w-[3px]"
        style={{
          background: toast.kind === 'error' ? '#e0523c' : 'var(--signal)',
        }}
      />
      <span
        className={`shrink-0 ${toast.kind === 'error' ? 'text-[#e0523c]' : 'text-signal'}`}
      >
        {ICONS[toast.kind]}
      </span>
      <p className="flex-1 min-w-0 text-[13px] leading-snug">{toast.message}</p>
      {toast.action && (
        <button
          onClick={() => {
            toast.action?.run()
            dismissToast(toast.id)
          }}
          className="shrink-0 text-[12px] text-signal font-medium px-2 py-1 rounded hover:bg-line-soft transition-colors"
        >
          {toast.action.label}
        </button>
      )}
      <button
        onClick={() => dismissToast(toast.id)}
        aria-label="Dismiss"
        className="control-btn w-6 h-6 shrink-0"
      >
        <CloseIcon className="w-3 h-3" />
      </button>
    </motion.div>
  )
}
