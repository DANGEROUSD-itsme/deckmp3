import { useState } from 'react'
import { AnimatePresence, Reorder, motion } from 'framer-motion'
import { useDeck } from '../store/deck'
import { fmtDuration, fmtTime } from '../lib/format'
import { Cover } from './Cover'
import { Drawer } from './ui'
import { CloseIcon, PlayIcon, QueueIcon, ShuffleIcon, TrashIcon, UploadIcon } from './icons'

/**
 * The live queue, editable in place. Rows are keyed by cursor index rather
 * than track id: the same track can legitimately appear in a queue twice, and
 * keying by id would make the two entries fight over one DOM node.
 */
export function QueueView() {
  const {
    closePanel,
    queueEntries,
    cursor,
    jumpTo,
    removeFromQueue,
    moveInQueue,
    clearQueue,
    shuffleQueue,
    saveQueueAsPlaylist,
    isPlaying,
    toggle,
  } = useDeck()

  const [saving, setSaving] = useState(false)
  const [name, setName] = useState('')

  const played = queueEntries.filter((e) => e.index < cursor)
  const upcoming = queueEntries.filter((e) => e.index > cursor)
  const nowPlaying = queueEntries.find((e) => e.index === cursor)
  const remaining = upcoming.reduce((s, e) => s + e.track.duration, 0)

  const submitSave = async () => {
    await saveQueueAsPlaylist(name.trim() || 'Saved queue')
    setName('')
    setSaving(false)
  }

  return (
    <Drawer
      title="Queue"
      subtitle={
        queueEntries.length
          ? `${upcoming.length} up next · ${fmtDuration(remaining)} left`
          : 'Nothing queued'
      }
      icon={<QueueIcon className="w-[18px] h-[18px]" />}
      onClose={closePanel}
      footer={
        <>
          <button
            onClick={shuffleQueue}
            disabled={upcoming.length < 2}
            className="ghost-btn disabled:opacity-40"
          >
            <ShuffleIcon className="w-3.5 h-3.5" />
            Reshuffle
          </button>
          <button
            onClick={() => setSaving(true)}
            disabled={!queueEntries.length}
            className="ghost-btn disabled:opacity-40"
          >
            <UploadIcon className="w-3.5 h-3.5" />
            Save
          </button>
          <button
            onClick={clearQueue}
            disabled={!upcoming.length}
            className="ghost-btn ghost-btn-danger ml-auto disabled:opacity-40"
          >
            <TrashIcon className="w-3.5 h-3.5" />
            Clear
          </button>
        </>
      }
    >
      <AnimatePresence>
        {saving && (
          <motion.form
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            onSubmit={(e) => {
              e.preventDefault()
              void submitSave()
            }}
            className="overflow-hidden mb-3"
          >
            <div className="flex gap-2 px-1">
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Playlist name"
                className="field flex-1"
              />
              <button type="submit" className="ghost-btn">
                Save
              </button>
              <button type="button" onClick={() => setSaving(false)} className="control-btn w-8 h-8">
                <CloseIcon className="w-3.5 h-3.5" />
              </button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      {!queueEntries.length && (
        <p className="label text-center py-12 normal-case tracking-normal">
          Play something and it shows up here.
        </p>
      )}

      {played.length > 0 && (
        <>
          <p className="label px-2 pb-1.5">Played</p>
          <div className="opacity-45 mb-3">
            {played.slice(-8).map((e) => (
              <QueueRow
                key={`p-${e.index}`}
                index={e.index}
                title={e.track.title}
                artist={e.track.artist}
                artKey={e.track.artKey}
                duration={e.track.duration}
                onPlay={() => void jumpTo(e.index)}
                onRemove={() => removeFromQueue(e.index)}
              />
            ))}
          </div>
        </>
      )}

      {nowPlaying && (
        <>
          <p className="label px-2 pb-1.5">Now playing</p>
          <button
            onClick={() => void toggle()}
            className="w-full flex items-center gap-3 px-2 py-2 rounded-md bg-surface mb-3 text-left"
          >
            <div className="w-10 h-10 shrink-0 rounded-[3px] overflow-hidden well relative">
              <Cover
                artKey={nowPlaying.track.artKey}
                title={nowPlaying.track.title}
                className="w-full h-full"
                rounded="rounded-[3px]"
              />
              {isPlaying && (
                <span className="absolute inset-0 grid place-items-center bg-black/45">
                  <span className="flex items-end gap-[2px] h-3">
                    {[0, 1, 2].map((i) => (
                      <motion.span
                        key={i}
                        className="w-[2.5px] bg-signal rounded-full"
                        animate={{ height: ['30%', '100%', '45%', '85%', '30%'] }}
                        transition={{
                          duration: 0.9 + i * 0.15,
                          repeat: Infinity,
                          ease: 'easeInOut',
                          delay: i * 0.12,
                        }}
                      />
                    ))}
                  </span>
                </span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] leading-tight truncate text-signal font-medium">
                {nowPlaying.track.title}
              </p>
              <p className="label mt-0.5 truncate normal-case tracking-normal">
                {nowPlaying.track.artist}
              </p>
            </div>
          </button>
        </>
      )}

      {upcoming.length > 0 && (
        <>
          <p className="label px-2 pb-1.5">Up next · drag to reorder</p>
          <Reorder.Group
            axis="y"
            values={upcoming.map((e) => e.index)}
            onReorder={(next) => {
              // Reorder hands back the whole reordered array; diffing it
              // against the old order finds the single row that moved, which
              // is all `moveInQueue` needs to keep the cursor correct.
              const before = upcoming.map((e) => e.index)
              const from = before.findIndex((v, i) => v !== next[i])
              if (from === -1) return
              const moved = next[from]
              moveInQueue(moved, before[from])
            }}
          >
            {upcoming.map((e) => (
              <Reorder.Item key={e.index} value={e.index} className="touch-none">
                <QueueRow
                  index={e.index}
                  title={e.track.title}
                  artist={e.track.artist}
                  artKey={e.track.artKey}
                  duration={e.track.duration}
                  onPlay={() => void jumpTo(e.index)}
                  onRemove={() => removeFromQueue(e.index)}
                />
              </Reorder.Item>
            ))}
          </Reorder.Group>
        </>
      )}
    </Drawer>
  )
}

function QueueRow({
  title,
  artist,
  artKey,
  duration,
  onPlay,
  onRemove,
}: {
  index: number
  title: string
  artist: string
  artKey: string | null
  duration: number
  onPlay: () => void
  onRemove: () => void
}) {
  return (
    <div className="group flex items-center gap-3 px-2 py-1.5 rounded-md hover:bg-surface/70 transition-colors">
      <button onClick={onPlay} className="flex items-center gap-3 min-w-0 flex-1 text-left">
        <div className="w-9 h-9 shrink-0 rounded-[3px] overflow-hidden well relative">
          <Cover artKey={artKey} title={title} className="w-full h-full" rounded="rounded-[3px]" />
          <span className="absolute inset-0 grid place-items-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity">
            <PlayIcon className="w-3.5 h-3.5 text-white" />
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] leading-tight truncate">{title}</p>
          <p className="label mt-0.5 truncate normal-case tracking-normal">{artist}</p>
        </div>
      </button>
      <span className="readout label !text-[10px] shrink-0 group-hover:hidden">
        {fmtTime(duration)}
      </span>
      <button
        onClick={onRemove}
        aria-label={`Remove ${title} from queue`}
        className="control-btn w-6 h-6 shrink-0 hidden group-hover:flex"
      >
        <CloseIcon className="w-3 h-3" />
      </button>
    </div>
  )
}
