import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useDeck } from '../store/deck'
import { useDJ } from '../store/dj'
import type { DeckSide } from '../lib/djEngine'
import type { Track } from '../types'
import {
  AddToQueueIcon,
  ChevronIcon,
  CopyIcon,
  DjIcon,
  HeartIcon,
  InfoIcon,
  LayersIcon,
  PlayIcon,
  PlayNextIcon,
  PlusIcon,
  StarIcon,
  TrashIcon,
  UserIcon,
} from './icons'

/* ---------------------------------------------------------------------------
   Right-click / long-press menu for a track. Provided through context so any
   row anywhere can open one without every list re-implementing positioning,
   dismissal and edge-flipping.
   --------------------------------------------------------------------------- */

interface MenuRequest {
  track: Track
  x: number
  y: number
  /** Optional list-specific extra, e.g. "Remove from this playlist". */
  extra?: { label: string; icon?: ReactNode; destructive?: boolean; run: () => void }
}

interface MenuApi {
  open: (e: React.MouseEvent, track: Track, extra?: MenuRequest['extra']) => void
  openAt: (x: number, y: number, track: Track, extra?: MenuRequest['extra']) => void
}

const MenuCtx = createContext<MenuApi | null>(null)

export function useTrackMenu() {
  const api = useContext(MenuCtx)
  if (!api) throw new Error('useTrackMenu must be used inside <TrackMenuProvider>')
  return api
}

const MENU_W = 232
const MENU_H_EST = 340

export function TrackMenuProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<MenuRequest | null>(null)

  const openAt = useCallback(
    (x: number, y: number, track: Track, extra?: MenuRequest['extra']) => {
      // Flip the menu back inside the viewport rather than letting it clip.
      const px = Math.min(x, window.innerWidth - MENU_W - 8)
      const py = Math.min(y, window.innerHeight - MENU_H_EST - 8)
      setRequest({ track, x: Math.max(8, px), y: Math.max(8, py), extra })
    },
    []
  )

  const open = useCallback<MenuApi['open']>(
    (e, track, extra) => {
      e.preventDefault()
      e.stopPropagation()
      openAt(e.clientX, e.clientY, track, extra)
    },
    [openAt]
  )

  const api: MenuApi = { open, openAt }

  return (
    <MenuCtx.Provider value={api}>
      {children}
      <AnimatePresence>
        {request && <Menu request={request} onClose={() => setRequest(null)} />}
      </AnimatePresence>
    </MenuCtx.Provider>
  )
}

function Menu({ request, onClose }: { request: MenuRequest; onClose: () => void }) {
  const {
    tracks,
    playNow,
    playNext,
    addToQueue,
    playlists,
    addToPlaylist,
    createPlaylist,
    toggleFavorite,
    setRating,
    statsFor,
    toast,
    resolveFile,
  } = useDeck()
  const { loadDeck, openMixer } = useDJ()
  const { track } = request
  const [submenu, setSubmenu] = useState(false)
  const stats = statsFor(track.id)

  // Any click, scroll, resize or Escape closes it — a context menu that
  // outlives its context is worse than no context menu.
  useEffect(() => {
    const close = () => onClose()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('resize', close)
    window.addEventListener('scroll', close, true)
    document.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('resize', close)
      window.removeEventListener('scroll', close, true)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const act = (fn: () => void) => () => {
    fn()
    onClose()
  }

  const albumIds = tracks.filter((t) => t.albumKey === track.albumKey).map((t) => t.id)
  const artistIds = tracks
    .filter((t) => t.albumArtist.toLowerCase() === track.albumArtist.toLowerCase())
    .map((t) => t.id)

  const loadToDeck = (side: DeckSide) => {
    void (async () => {
      const file = await resolveFile(track)
      if (!file) {
        toast(`Missing file: ${track.title}`, 'error')
        return
      }
      await loadDeck(side, track, file)
      openMixer()
      toast(`Loaded \u201c${track.title}\u201d to Deck ${side.toUpperCase()}.`, 'success')
    })()
  }

  const copyDetails = () => {
    const text = `${track.artist} — ${track.title} (${track.album}${track.year ? `, ${track.year}` : ''})`
    void navigator.clipboard
      ?.writeText(text)
      .then(() => toast('Track details copied.', 'success'))
      .catch(() => toast('Clipboard is not available here.', 'error'))
  }

  return (
    <>
      {/* Invisible catcher so the first click anywhere dismisses. */}
      <div className="fixed inset-0 z-[85]" onClick={onClose} onContextMenu={(e) => {
        e.preventDefault()
        onClose()
      }} />
      <motion.div
        role="menu"
        aria-label={`Actions for ${track.title}`}
        initial={{ opacity: 0, scale: 0.95, y: -4 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.1 } }}
        transition={{ duration: 0.15, ease: [0.22, 1, 0.36, 1] }}
        style={{ left: request.x, top: request.y, width: MENU_W }}
        className="fixed z-[86] glass raise-lg border border-line rounded-lg py-1.5 origin-top-left"
      >
        <div className="px-3 py-1.5 border-b border-line mb-1">
          <p className="text-[12.5px] leading-tight truncate font-medium">{track.title}</p>
          <p className="label mt-0.5 truncate normal-case tracking-normal">{track.artist}</p>
        </div>

        <Item
          icon={<PlayIcon className="w-3.5 h-3.5" />}
          label="Play"
          onClick={act(() => void playNow(track.id, [track.id]))}
        />
        <Item
          icon={<PlayNextIcon className="w-3.5 h-3.5" />}
          label="Play next"
          onClick={act(() => playNext([track.id]))}
        />
        <Item
          icon={<AddToQueueIcon className="w-3.5 h-3.5" />}
          label="Add to queue"
          onClick={act(() => addToQueue([track.id]))}
        />

        <Divider />

        <Item
          icon={<DjIcon className="w-3.5 h-3.5" />}
          label="Load to Deck A"
          onClick={act(() => loadToDeck('a'))}
        />
        <Item
          icon={<DjIcon className="w-3.5 h-3.5" />}
          label="Load to Deck B"
          onClick={act(() => loadToDeck('b'))}
        />

        <Divider />

        <Item
          icon={<LayersIcon className="w-3.5 h-3.5" />}
          label="Play the album"
          hint={`${albumIds.length} tracks`}
          onClick={act(() => void playNow(track.id, albumIds))}
        />
        <Item
          icon={<UserIcon className="w-3.5 h-3.5" />}
          label="Play this artist"
          hint={`${artistIds.length} tracks`}
          onClick={act(() => void playNow(track.id, artistIds))}
        />

        <Divider />

        <Item
          icon={<HeartIcon className="w-3.5 h-3.5" filled={stats.favorite} />}
          label={stats.favorite ? 'Remove from favourites' : 'Add to favourites'}
          accent={stats.favorite}
          onClick={act(() => toggleFavorite(track.id))}
        />

        {/* Rating is a row of stars rather than five menu items. */}
        <div className="px-3 py-1.5 flex items-center gap-2">
          <StarIcon className="w-3.5 h-3.5 text-ink-faint shrink-0" />
          <div className="flex items-center gap-0.5">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                onClick={() => setRating(track.id, n)}
                aria-label={`Rate ${n} star${n === 1 ? '' : 's'}`}
                className="p-0.5 hover:scale-125 transition-transform"
              >
                <StarIcon
                  className={`w-3.5 h-3.5 ${n <= stats.rating ? 'text-signal' : 'text-ink-faint'}`}
                  filled={n <= stats.rating}
                />
              </button>
            ))}
          </div>
        </div>

        <Divider />

        {/* Add to playlist opens in place rather than as a flyout: a nested
            hover menu is fiddly on touch, and this list is usually short. */}
        <button
          role="menuitem"
          onClick={() => setSubmenu((s) => !s)}
          className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[13px] text-ink-dim hover:text-ink hover:bg-surface/70 transition-colors text-left"
        >
          <PlusIcon className="w-3.5 h-3.5 shrink-0" />
          <span className="flex-1 truncate">Add to playlist</span>
          <ChevronIcon className="w-3 h-3 shrink-0" dir={submenu ? 'down' : 'right'} />
        </button>

        <AnimatePresence>
          {submenu && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden max-h-52 overflow-y-auto"
            >
              {playlists.map((p) => (
                <button
                  key={p.id}
                  role="menuitem"
                  onClick={act(() => void addToPlaylist(p.id, [track.id]))}
                  className="w-full flex items-center gap-2 pl-9 pr-3 py-1.5 text-[12.5px] text-ink-dim hover:text-ink hover:bg-surface/70 transition-colors text-left"
                >
                  <span className="flex-1 truncate">{p.name}</span>
                  <span className="label !text-[9px]">{p.trackIds.length}</span>
                </button>
              ))}
              <button
                role="menuitem"
                onClick={act(() => void createPlaylist(`${track.album}`, [track.id]))}
                className="w-full flex items-center gap-2 pl-9 pr-3 py-1.5 text-[12.5px] text-signal hover:bg-surface/70 transition-colors text-left"
              >
                New playlist…
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <Divider />

        <Item
          icon={<CopyIcon className="w-3.5 h-3.5" />}
          label="Copy track details"
          onClick={act(copyDetails)}
        />
        <Item
          icon={<InfoIcon className="w-3.5 h-3.5" />}
          label="Track info"
          onClick={act(() => window.dispatchEvent(new CustomEvent('deck:info', { detail: track })))}
        />

        {request.extra && (
          <>
            <Divider />
            <Item
              icon={request.extra.icon ?? <TrashIcon className="w-3.5 h-3.5" />}
              label={request.extra.label}
              destructive={request.extra.destructive}
              onClick={act(request.extra.run)}
            />
          </>
        )}
      </motion.div>
    </>
  )
}

function Divider() {
  return <div className="h-px bg-line my-1 mx-2" />
}

function Item({
  icon,
  label,
  hint,
  onClick,
  destructive,
  accent,
}: {
  icon: ReactNode
  label: string
  hint?: string
  onClick: () => void
  destructive?: boolean
  accent?: boolean
}) {
  return (
    <button
      role="menuitem"
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-[13px] transition-colors text-left hover:bg-surface/70 ${
        destructive
          ? 'text-[#e0523c] hover:text-[#e0523c]'
          : accent
            ? 'text-signal'
            : 'text-ink-dim hover:text-ink'
      }`}
    >
      <span className="shrink-0">{icon}</span>
      <span className="flex-1 truncate">{label}</span>
      {hint && <span className="label !text-[9px] shrink-0">{hint}</span>}
    </button>
  )
}
