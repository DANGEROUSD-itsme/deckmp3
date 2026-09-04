import { motion } from 'framer-motion'
import { useDeck } from '../store/deck'
import { Scrim, useOverlay } from './ui'
import { AlertIcon } from './icons'

/**
 * One dialog for every destructive action. Nothing in DECK deletes anything
 * without coming through here first.
 */
export function ConfirmDialog() {
  const { confirm, closeConfirm } = useDeck()
  const ref = useOverlay(closeConfirm, !!confirm)

  if (!confirm) return null

  const run = async () => {
    await confirm.run()
    closeConfirm()
  }

  return (
    <div className="fixed inset-0 z-[90] grid place-items-center p-4">
      <Scrim onClose={closeConfirm} />
      <motion.div
        ref={ref}
        role="alertdialog"
        aria-modal="true"
        aria-label={confirm.title}
        initial={{ opacity: 0, scale: 0.94, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 6 }}
        transition={{ type: 'spring', stiffness: 420, damping: 30 }}
        className="relative w-full max-w-sm glass raise-lg border border-line rounded-xl p-5"
      >
        <div className="flex items-start gap-3">
          <span
            className={`w-9 h-9 shrink-0 rounded-lg grid place-items-center ${
              confirm.destructive ? 'text-[#e0523c] bg-[#e0523c]/12' : 'text-signal bg-surface'
            }`}
          >
            <AlertIcon className="w-[18px] h-[18px]" />
          </span>
          <div className="min-w-0">
            <h2 className="display text-[15px] leading-tight">{confirm.title}</h2>
            <p className="text-[13px] text-ink-dim leading-relaxed mt-1.5">{confirm.body}</p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 mt-5">
          <button onClick={closeConfirm} className="ghost-btn" data-autofocus>
            Cancel
          </button>
          <button
            onClick={() => void run()}
            className={`pill-btn !py-2 !px-4 ${
              confirm.destructive ? '!bg-[#c0392b] !text-white hover:!bg-[#a93226]' : ''
            }`}
          >
            {confirm.confirmLabel}
          </button>
        </div>
      </motion.div>
    </div>
  )
}
