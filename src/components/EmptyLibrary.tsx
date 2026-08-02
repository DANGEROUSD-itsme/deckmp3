import { motion } from 'framer-motion'
import { useDeck } from '../store/deck'
import { DiscIcon, FolderIcon } from './icons'

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
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 2.2, repeat: Infinity, ease: 'linear' }}
        >
          <DiscIcon className="w-9 h-9 text-ink-faint" />
        </motion.div>
      </div>
    )
  }

  return (
    <div className="flex-1 grid place-items-center px-6">
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="max-w-sm text-center"
      >
        <div className="w-16 h-16 rounded-full bg-surface mx-auto grid place-items-center mb-6 well">
          <FolderIcon className="w-7 h-7 text-ink-faint" />
        </div>

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
              Choose folder
            </button>
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
      </motion.div>
    </div>
  )
}
