import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useDeck } from '../store/deck'
import { useDJ } from '../store/dj'
import { DECK_VERSION, SMART_VIEWS, type SmartViewId } from '../types'
import {
  ChartIcon,
  ChevronIcon,
  CommandIcon,
  DiscIcon,
  DjIcon,
  FolderIcon,
  GearIcon,
  HeartIcon,
  InfoIcon,
  MoonIcon,
  PlusIcon,
  QueueIcon,
  SlidersIcon,
  SparkIcon,
  SunIcon,
  TrashIcon,
  VibeIcon,
} from './icons'

export type View =
  | { kind: 'library' }
  | { kind: 'playlist'; id: string }
  | { kind: 'smart'; id: SmartViewId }

interface Props {
  view: View
  onNavigate: (v: View) => void
}

const SMART_LIMIT = 3

export function Sidebar({ view, onNavigate }: Props) {
  const {
    playlists,
    createPlaylist,
    removePlaylist,
    chooseFolder,
    theme,
    toggleTheme,
    openPanel,
    ask,
    smartList,
    upNext,
  } = useDeck()
  const { openMixer } = useDJ()
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [smartOpen, setSmartOpen] = useState(true)

  const submit = async () => {
    const p = await createPlaylist(name || 'New playlist')
    setName('')
    setCreating(false)
    onNavigate({ kind: 'playlist', id: p.id })
  }

  /**
   * Each smart view is a full scan of the library, so deriving six of them
   * inline would be O(6n) on every sidebar render — and the sidebar renders
   * whenever anything in the store moves.
   */
  const counts = useMemo(() => {
    const out: Partial<Record<SmartViewId, number>> = {}
    for (const sv of SMART_VIEWS) out[sv.id] = smartList(sv.id).length
    return out
  }, [smartList])

  const visibleSmart = smartOpen ? SMART_VIEWS : SMART_VIEWS.slice(0, SMART_LIMIT)

  return (
    <aside className="w-[76px] lg:w-[236px] shrink-0 border-r border-line bg-panel-deep flex flex-col">
      <div className="h-16 lg:h-[72px] flex items-center justify-center lg:justify-start lg:px-5 shrink-0 border-b border-line">
        <button
          onClick={() => openPanel('about')}
          className="flex items-center gap-2.5 group"
          title={`DECK v${DECK_VERSION} — about`}
        >
          <span className="w-7 h-7 rounded-full bg-signal grid place-items-center shrink-0 transition-transform group-hover:scale-110">
            <span className="w-2 h-2 rounded-full bg-panel-deep" />
          </span>
          <span className="hidden lg:flex items-baseline gap-1.5">
            <span className="display-wide text-lg tracking-wide">DECK</span>
            {/* The version, silkscreened small — the way real gear prints it. */}
            <span className="label !text-[8.5px] !tracking-[0.14em] text-signal">
              v{DECK_VERSION}
            </span>
          </span>
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto py-3 px-2 lg:px-3">
        <button
          onClick={() => onNavigate({ kind: 'library' })}
          className={`nav-item ${view.kind === 'library' ? 'nav-item-active' : ''}`}
        >
          <DiscIcon className="w-[18px] h-[18px] shrink-0" />
          <span className="hidden lg:inline">Library</span>
        </button>

        <button
          onClick={() => openPanel('queue')}
          className="nav-item"
          title="Queue"
        >
          <QueueIcon className="w-[18px] h-[18px] shrink-0" />
          <span className="hidden lg:inline flex-1 text-left">Queue</span>
          {upNext.length > 0 && (
            <span className="hidden lg:grid place-items-center label !text-[9px] min-w-4 h-4 px-1 rounded-full bg-surface">
              {upNext.length}
            </span>
          )}
        </button>

        <button onClick={openMixer} className="nav-item" title="DJ mode (D)">
          <DjIcon className="w-[18px] h-[18px] shrink-0" />
          <span className="hidden lg:inline flex-1 text-left">DJ Mode</span>
        </button>

        {/* --- Smart views --- */}
        <div className="mt-6 mb-1.5 px-2.5 hidden lg:flex items-center justify-between">
          <span className="label">Collections</span>
          <button
            onClick={() => setSmartOpen((s) => !s)}
            className="text-ink-faint hover:text-signal transition-colors"
            aria-label={smartOpen ? 'Show fewer collections' : 'Show all collections'}
            aria-expanded={smartOpen}
          >
            <ChevronIcon className="w-3 h-3" dir={smartOpen ? 'up' : 'down'} />
          </button>
        </div>

        {visibleSmart.map((sv) => {
          const count = counts[sv.id] ?? 0
          const active = view.kind === 'smart' && view.id === sv.id
          return (
            <button
              key={sv.id}
              onClick={() => onNavigate({ kind: 'smart', id: sv.id })}
              className={`nav-item ${active ? 'nav-item-active' : ''}`}
              title={`${sv.name} — ${sv.hint}`}
            >
              {sv.id === 'favorites' ? (
                <HeartIcon className="w-[18px] h-[18px] shrink-0" filled={active} />
              ) : (
                <SparkIcon className="w-[18px] h-[18px] shrink-0" />
              )}
              <span className="hidden lg:inline flex-1 text-left truncate">{sv.name}</span>
              <span className="hidden lg:block label !text-[9px]">{count}</span>
            </button>
          )
        })}

        {/* --- Playlists --- */}
        <div className="mt-6 mb-2 px-2.5 hidden lg:flex items-center justify-between">
          <span className="label">Playlists</span>
          <button
            onClick={() => setCreating(true)}
            className="text-ink-faint hover:text-signal transition-colors"
            aria-label="New playlist"
          >
            <PlusIcon className="w-3.5 h-3.5" />
          </button>
        </div>

        <AnimatePresence>
          {creating && (
            <motion.form
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              onSubmit={(e) => {
                e.preventDefault()
                void submit()
              }}
              className="mb-2 hidden lg:block overflow-hidden"
            >
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => (name.trim() ? void submit() : setCreating(false))}
                onKeyDown={(e) => e.key === 'Escape' && setCreating(false)}
                placeholder="Playlist name"
                className="field !py-1.5"
              />
            </motion.form>
          )}
        </AnimatePresence>

        {playlists.map((p) => (
          <div key={p.id} className="group relative">
            <button
              onClick={() => onNavigate({ kind: 'playlist', id: p.id })}
              className={`nav-item ${
                view.kind === 'playlist' && view.id === p.id ? 'nav-item-active' : ''
              }`}
              title={p.name}
            >
              <span className="w-[18px] h-[18px] shrink-0 grid place-items-center label !text-[9px] border border-current rounded-[2px] opacity-70">
                {p.trackIds.length}
              </span>
              <span className="hidden lg:inline truncate">{p.name}</span>
            </button>
            <button
              onClick={() =>
                ask({
                  title: `Delete “${p.name}”?`,
                  body: 'The playlist is removed. The tracks themselves stay in your library.',
                  confirmLabel: 'Delete',
                  destructive: true,
                  run: () => {
                    void removePlaylist(p.id)
                    if (view.kind === 'playlist' && view.id === p.id) {
                      onNavigate({ kind: 'library' })
                    }
                  },
                })
              }
              aria-label={`Delete ${p.name}`}
              className="hidden lg:grid place-items-center absolute right-1.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded text-ink-faint hover:text-[#e0523c] opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <TrashIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}

        {!playlists.length && (
          <p className="hidden lg:block label px-2.5 py-2 normal-case tracking-normal leading-relaxed">
            No playlists yet. Right-click any track to start one.
          </p>
        )}
      </nav>

      <div className="p-2 lg:p-3 border-t border-line space-y-0.5">
        <button
          onClick={() => openPanel('palette')}
          className="nav-item"
          title="Command palette (⌘K)"
        >
          <CommandIcon className="w-[18px] h-[18px] shrink-0" />
          <span className="hidden lg:inline flex-1 text-left">Search</span>
          <kbd className="hidden lg:inline-grid kbd !h-4 !min-w-4 !text-[8px] !px-1">⌘K</kbd>
        </button>
        <button onClick={() => openPanel('equalizer')} className="nav-item" title="Equalizer">
          <SlidersIcon className="w-[18px] h-[18px] shrink-0" />
          <span className="hidden lg:inline">Equalizer</span>
        </button>
        <button onClick={() => openPanel('vibe')} className="nav-item" title="Vibe mode (V)">
          <VibeIcon className="w-[18px] h-[18px] shrink-0" />
          <span className="hidden lg:inline">Vibe Mode</span>
        </button>
        <button onClick={() => openPanel('stats')} className="nav-item" title="Statistics">
          <ChartIcon className="w-[18px] h-[18px] shrink-0" />
          <span className="hidden lg:inline">Statistics</span>
        </button>
        <button
          onClick={() => void chooseFolder()}
          className="nav-item"
          title="Add a music folder"
        >
          <FolderIcon className="w-[18px] h-[18px] shrink-0" />
          <span className="hidden lg:inline">Folder</span>
        </button>
        <button onClick={toggleTheme} className="nav-item" title="Toggle theme">
          {theme === 'dark' ? (
            <SunIcon className="w-[18px] h-[18px] shrink-0" />
          ) : (
            <MoonIcon className="w-[18px] h-[18px] shrink-0" />
          )}
          <span className="hidden lg:inline">{theme === 'dark' ? 'Light' : 'Dark'}</span>
        </button>
        <button onClick={() => openPanel('settings')} className="nav-item" title="Settings">
          <GearIcon className="w-[18px] h-[18px] shrink-0" />
          <span className="hidden lg:inline">Settings</span>
        </button>
        <button onClick={() => openPanel('about')} className="nav-item" title="About DECK">
          <InfoIcon className="w-[18px] h-[18px] shrink-0" />
          <span className="hidden lg:inline flex-1 text-left">About</span>
          <span className="hidden lg:block label !text-[8.5px]">v{DECK_VERSION}</span>
        </button>

        <a
          href="https://studiosdpe.com"
          target="_blank"
          rel="noopener noreferrer"
          className="label !text-[9px] block text-center lg:text-left px-2.5 pt-2 text-ink-faint hover:text-signal transition-colors"
        >
          <span className="hidden lg:inline">Developed by </span>studiosdpe.com
        </a>
      </div>
    </aside>
  )
}
