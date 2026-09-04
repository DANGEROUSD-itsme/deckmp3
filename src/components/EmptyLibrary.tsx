import { motion } from 'framer-motion'
import { useDeck } from '../store/deck'
import { DECK_VERSION } from '../types'
import { DiscIcon, FolderIcon, SparkIcon, UploadIcon } from './icons'

/**
 * First-run / no-library state. Also doubles as the "grant access again"
 * screen — a re-opened tab loses live FileSystemDirectoryHandle permission
 * even though the handle itself persists in IndexedDB.
 */
export function EmptyLibrary({ status }: { status: 'empty' | 'loading' }) {
  const { chooseFolder, grantAccess, supported, status: liveStatus } = useDeck()
  const needsPermission = liveStatus === 'needs-permission'

  if (status === 'loading') {
    return (
      <div className="flex-1 grid place-items-center">
        <div className="text-center">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 2.2, repeat: Infinity, ease: 'linear' }}
            className="inline-block"
          >
            <DiscIcon className="w-9 h-9 text-ink-faint" />
          </motion.div>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8 }}
            className="label mt-5"
          >
            Reading your library
          </motion.p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 grid place-items-center px-6">
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="max-w-md text-center"
      >
        <motion.div
          initial={{ scale: 0.85 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 220, damping: 18, delay: 0.1 }}
          className="w-16 h-16 rounded-full bg-surface mx-auto grid place-items-center mb-6 well"
        >
          <FolderIcon className="w-7 h-7 text-ink-faint" />
        </motion.div>

        {needsPermission ? (
          <>
            <h2 className="display-wide text-xl mb-2">Reconnect your library</h2>
            <p className="text-sm text-ink-dim leading-relaxed mb-6">
              {supported
                ? 'Your browser needs permission again after closing the tab. Nothing was lost — just say the word.'
                : 'Your browser can’t keep a folder open between visits. Reselect the same folder — DECK already knows the tags and art, so this is instant.'}
            </p>
            <button onClick={() => void grantAccess()} className="pill-btn">
              {supported ? 'Grant access' : 'Reselect folder'}
            </button>
          </>
        ) : (
          <>
            <h2 className="display-wide text-xl mb-2">Load your library</h2>
            <p className="text-sm text-ink-dim leading-relaxed mb-6">
              Point DECK at a folder of MP3s. It reads tags and artwork once,
              then plays entirely offline from then on.
            </p>
            <button onClick={() => void chooseFolder()} className="pill-btn">
              <FolderIcon className="w-4 h-4" />
              Choose folder
            </button>

            {/* The drop hint, so the second import path is discoverable. */}
            <div className="mt-8 rounded-lg border border-dashed border-line px-5 py-4">
              <div className="flex items-center justify-center gap-2 text-ink-faint">
                <UploadIcon className="w-4 h-4" />
                <span className="label">or drop MP3s anywhere on this window</span>
              </div>
            </div>

            {!supported && (
              <p className="text-xs text-ink-faint mt-4 leading-relaxed">
                This browser doesn't support the File System Access API, so
                DECK copies your tracks into its own storage the first time.
                After that it launches straight to your library — fully
                offline, no reselecting.
              </p>
            )}
          </>
        )}

        <p className="label !text-[9px] mt-10 flex items-center justify-center gap-1.5">
          <SparkIcon className="w-3 h-3 text-signal" />
          DECK v{DECK_VERSION}
        </p>
      </motion.div>
    </div>
  )
}

/**
 * The "you have a library but we lost the handle" banner. Shown above a
 * populated library rather than replacing it — v1 raised this status but no
 * screen ever rendered it, so the only symptom was every track failing to
 * play with "Missing file".
 */
export function ReconnectBanner() {
  const { grantAccess, supported } = useDeck()
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className="shrink-0 bg-surface border-b border-line px-5 py-2.5 flex items-center gap-3 flex-wrap"
    >
      <span className="w-2 h-2 rounded-full bg-signal pulse-dot shrink-0" />
      <p className="text-[13px] flex-1 min-w-0">
        DECK can see your library but can’t read the files yet.{' '}
        <span className="text-ink-dim">
          {supported
            ? 'Browsers drop folder permission when the tab closes.'
            : 'Reselect the same folder to relink it.'}
        </span>
      </p>
      <button onClick={() => void grantAccess()} className="ghost-btn shrink-0">
        {supported ? 'Grant access' : 'Reselect folder'}
      </button>
    </motion.div>
  )
}
