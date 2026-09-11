import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { useDeck } from '../store/deck'
import { useDJ } from '../store/dj'
import { fuzzyRank, highlightRuns } from '../lib/fuzzy'
import { fmtTime } from '../lib/format'
import { SMART_VIEWS, VIBE_PRESETS, type Track } from '../types'
import { Scrim, useOverlay } from './ui'
import {
  ChartIcon,
  CommandIcon,
  DiscIcon,
  DjIcon,
  VibeIcon,
  FolderIcon,
  GearIcon,
  HeartIcon,
  InfoIcon,
  KeyboardIcon,
  LayersIcon,
  MoonIcon,
  NextIcon,
  PauseIcon,
  PlayIcon,
  PlayNextIcon,
  PrevIcon,
  QueueIcon,
  RefreshIcon,
  RepeatIcon,
  SearchIcon,
  ShuffleIcon,
  SlidersIcon,
  SparkIcon,
  SunIcon,
  TimerIcon,
} from './icons'

/* ---------------------------------------------------------------------------
   ⌘K. One box that reaches everything: tracks, albums, playlists, smart views,
   and every command the transport and the panels expose.

   Results are ranked in two passes — commands first when the query is short
   (you type "pl" wanting Play, not the 400 tracks with "pl" in them), tracks
   first once the query looks like a search. That single heuristic is what
   makes it feel like it read your mind.
   --------------------------------------------------------------------------- */

interface Command {
  id: string
  label: string
  hint?: string
  group: string
  icon: React.ReactNode
  /** Extra words that should match this row without being displayed. */
  keywords?: string
  run: () => void
}

type Row =
  | { kind: 'command'; command: Command; positions: number[] }
  | { kind: 'track'; track: Track; positions: number[] }

const ICON = 'w-4 h-4'

export function CommandPalette({ onNavigate }: { onNavigate: (v: NavTarget) => void }) {
  const deck = useDeck()
  const { openMixer, startAutoMix } = useDJ()
  const {
    closePanel,
    openPanel,
    tracks,
    playlists,
    playNow,
    playNext,
    addToQueue,
    toggle,
    next,
    prev,
    isPlaying,
    current,
    shuffle,
    toggleShuffle,
    repeat,
    cycleRepeat,
    theme,
    toggleTheme,
    toggleFavorite,
    statsFor,
    setSleep,
    rescan,
    chooseFolder,
    applyVibePreset,
  } = deck

  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)
  const ref = useOverlay(closePanel)

  const commands = useMemo<Command[]>(() => {
    const out: Command[] = [
      {
        id: 'play',
        label: isPlaying ? 'Pause' : 'Play',
        group: 'Transport',
        keywords: 'toggle resume stop space',
        icon: isPlaying ? <PauseIcon className={ICON} /> : <PlayIcon className={ICON} />,
        run: () => void toggle(),
      },
      {
        id: 'next',
        label: 'Next track',
        group: 'Transport',
        keywords: 'skip forward',
        icon: <NextIcon className={ICON} />,
        run: () => void next(),
      },
      {
        id: 'prev',
        label: 'Previous track',
        group: 'Transport',
        keywords: 'back rewind',
        icon: <PrevIcon className={ICON} />,
        run: () => void prev(),
      },
      {
        id: 'shuffle',
        label: shuffle ? 'Turn shuffle off' : 'Turn shuffle on',
        group: 'Transport',
        keywords: 'random',
        icon: <ShuffleIcon className={ICON} />,
        run: toggleShuffle,
      },
      {
        id: 'repeat',
        label: `Repeat: ${repeat === 'off' ? 'off' : repeat === 'all' ? 'all' : 'one'} — cycle`,
        group: 'Transport',
        keywords: 'loop again',
        icon: <RepeatIcon className={ICON} />,
        run: cycleRepeat,
      },
      {
        id: 'surprise',
        label: 'Surprise me',
        hint: 'Shuffle the whole library',
        group: 'Transport',
        keywords: 'random all everything',
        icon: <SparkIcon className={ICON} />,
        run: () => {
          if (!tracks.length) return
          const ids = tracks.map((t) => t.id)
          const pick = ids[Math.floor(Math.random() * ids.length)]
          if (!shuffle) toggleShuffle()
          void playNow(pick, ids)
        },
      },
      {
        id: 'queue',
        label: 'Open queue',
        group: 'Panels',
        keywords: 'up next list',
        icon: <QueueIcon className={ICON} />,
        run: () => openPanel('queue'),
      },
      {
        id: 'dj',
        label: 'Open DJ mode',
        group: 'Panels',
        keywords: 'mixer decks crossfader beatmatch',
        icon: <DjIcon className={ICON} />,
        run: openMixer,
      },
      {
        id: 'dj-automix',
        label: 'Auto Mix',
        hint: 'Beatmatch and blend the two decks automatically',
        group: 'Panels',
        keywords: 'mixer transition crossfade automatic sync',
        icon: <SparkIcon className={ICON} />,
        run: () => {
          openMixer()
          startAutoMix()
        },
      },
      {
        id: 'eq',
        label: 'Open equalizer',
        group: 'Panels',
        keywords: 'eq bass treble tone sound',
        icon: <SlidersIcon className={ICON} />,
        run: () => openPanel('equalizer'),
      },
      {
        id: 'vibe',
        label: 'Open Vibe Mode',
        group: 'Panels',
        keywords: 'effects reverb slowed nightcore crush distortion filter fx',
        icon: <VibeIcon className={ICON} />,
        run: () => openPanel('vibe'),
      },
      {
        id: 'settings',
        label: 'Open settings',
        group: 'Panels',
        keywords: 'preferences options config',
        icon: <GearIcon className={ICON} />,
        run: () => openPanel('settings'),
      },
      {
        id: 'stats',
        label: 'Library statistics',
        group: 'Panels',
        keywords: 'numbers counts top artists',
        icon: <ChartIcon className={ICON} />,
        run: () => openPanel('stats'),
      },
      {
        id: 'shortcuts',
        label: 'Keyboard shortcuts',
        group: 'Panels',
        keywords: 'keys help hotkeys',
        icon: <KeyboardIcon className={ICON} />,
        run: () => openPanel('shortcuts'),
      },
      {
        id: 'about',
        label: 'About DECK',
        group: 'Panels',
        keywords: 'version credits v2 2.01',
        icon: <InfoIcon className={ICON} />,
        run: () => openPanel('about'),
      },
      {
        id: 'theme',
        label: theme === 'dark' ? 'Switch to light' : 'Switch to dark',
        group: 'Appearance',
        keywords: 'dark light mode colour',
        icon: theme === 'dark' ? <SunIcon className={ICON} /> : <MoonIcon className={ICON} />,
        run: toggleTheme,
      },
      {
        id: 'library',
        label: 'Go to library',
        group: 'Go to',
        keywords: 'home albums',
        icon: <DiscIcon className={ICON} />,
        run: () => onNavigate({ kind: 'library' }),
      },
      {
        id: 'folder',
        label: 'Add a music folder',
        group: 'Library',
        keywords: 'import scan open directory',
        icon: <FolderIcon className={ICON} />,
        run: () => void chooseFolder(),
      },
      {
        id: 'rescan',
        label: 'Rescan library',
        group: 'Library',
        keywords: 'refresh reload update',
        icon: <RefreshIcon className={ICON} />,
        run: () => void rescan(),
      },
    ]

    if (current) {
      const fav = statsFor(current.id).favorite
      out.push({
        id: 'favorite',
        label: fav ? 'Unfavourite this track' : 'Favourite this track',
        hint: current.title,
        group: 'Now playing',
        keywords: 'heart like love',
        icon: <HeartIcon className={ICON} filled={fav} />,
        run: () => toggleFavorite(current.id),
      })
      out.push({
        id: 'play-album',
        label: 'Play this whole album',
        hint: current.album,
        group: 'Now playing',
        keywords: 'record lp',
        icon: <LayersIcon className={ICON} />,
        run: () => {
          const album = tracks.filter((t) => t.albumKey === current.albumKey)
          if (album.length) void playNow(album[0].id, album.map((t) => t.id))
        },
      })
    }

    for (const minutes of [15, 30, 45, 60]) {
      out.push({
        id: `sleep-${minutes}`,
        label: `Sleep in ${minutes} minutes`,
        group: 'Sleep timer',
        keywords: 'timer stop later night bed',
        icon: <TimerIcon className={ICON} />,
        run: () => setSleep(minutes),
      })
    }
    out.push({
      id: 'sleep-end',
      label: 'Stop at the end of this track',
      group: 'Sleep timer',
      keywords: 'timer sleep finish',
      icon: <TimerIcon className={ICON} />,
      run: () => setSleep('end-of-track'),
    })

    for (const preset of VIBE_PRESETS) {
      if (preset.name === 'Off') continue
      out.push({
        id: `vibe-${preset.name}`,
        label: `Vibe: ${preset.name}`,
        group: 'Vibe Mode',
        keywords: 'effects fx reverb slow fast crush distort filter tempo',
        icon: <VibeIcon className={ICON} />,
        run: () => {
          applyVibePreset(preset.name)
          openPanel('vibe')
        },
      })
    }

    for (const view of SMART_VIEWS) {
      out.push({
        id: `smart-${view.id}`,
        label: view.name,
        hint: view.hint,
        group: 'Go to',
        keywords: 'smart view list',
        icon: <SparkIcon className={ICON} />,
        run: () => onNavigate({ kind: 'smart', id: view.id }),
      })
    }

    for (const p of playlists) {
      out.push({
        id: `pl-${p.id}`,
        label: p.name,
        hint: `${p.trackIds.length} tracks`,
        group: 'Playlists',
        keywords: 'playlist',
        icon: <QueueIcon className={ICON} />,
        run: () => onNavigate({ kind: 'playlist', id: p.id }),
      })
      out.push({
        id: `pl-play-${p.id}`,
        label: `Play ${p.name}`,
        group: 'Playlists',
        keywords: 'playlist start',
        icon: <PlayIcon className={ICON} />,
        run: () => {
          if (p.trackIds.length) void playNow(p.trackIds[0], p.trackIds)
        },
      })
    }

    return out
  }, [
    applyVibePreset,
    chooseFolder,
    current,
    cycleRepeat,
    isPlaying,
    next,
    openMixer,
    startAutoMix,
    onNavigate,
    openPanel,
    playNow,
    playlists,
    prev,
    repeat,
    rescan,
    setSleep,
    shuffle,
    statsFor,
    theme,
    toggle,
    toggleFavorite,
    toggleShuffle,
    toggleTheme,
    tracks,
  ])

  const rows = useMemo<Row[]>(() => {
    const q = query.trim()
    if (!q) {
      // The resting state is a short menu of the things people actually reach
      // for, not an alphabetical dump of every command.
      return commands
        .filter((c) =>
          ['play', 'next', 'dj', 'queue', 'eq', 'surprise', 'settings', 'shortcuts', 'about'].includes(
            c.id
          )
        )
        .map((command) => ({ kind: 'command', command, positions: [] }) as Row)
    }

    const cmdHits = fuzzyRank(commands, q, (c) => `${c.label} ${c.group} ${c.keywords ?? ''}`, 10)
    const trackHits = fuzzyRank(
      tracks,
      q,
      (t) => `${t.title} ${t.artist} ${t.album}`,
      q.length < 2 ? 0 : 40
    )

    /**
     * Ranking interleaves groups — two Sleep timer hits either side of a
     * Transport hit — which would print the same group heading twice. Cluster
     * by group, keeping each group in the position its best hit earned.
     */
    const clusters = new Map<string, Row[]>()
    for (const h of cmdHits) {
      const rows = clusters.get(h.item.group)
      const row: Row = { kind: 'command', command: h.item, positions: h.positions }
      if (rows) rows.push(row)
      else clusters.set(h.item.group, [row])
    }
    const cmdRows: Row[] = [...clusters.values()].flat()

    const trackRows: Row[] = trackHits.map((h) => ({
      kind: 'track',
      track: h.item,
      positions: h.positions,
    }))

    // Short queries are almost always a command; longer ones a search.
    return q.length <= 3 ? [...cmdRows, ...trackRows] : [...trackRows, ...cmdRows]
  }, [commands, query, tracks])

  useEffect(() => setActive(0), [query])

  // Keep the highlighted row in view as the arrows walk down the list.
  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const run = (row: Row, mode: 'play' | 'next' | 'queue' = 'play') => {
    if (row.kind === 'command') {
      row.command.run()
      closePanel()
      return
    }
    const ids = tracks.map((t) => t.id)
    if (mode === 'next') playNext([row.track.id])
    else if (mode === 'queue') addToQueue([row.track.id])
    else void playNow(row.track.id, ids)
    closePanel()
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => (a + 1) % Math.max(1, rows.length))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => (a - 1 + rows.length) % Math.max(1, rows.length))
    } else if (e.key === 'Enter' && rows[active]) {
      e.preventDefault()
      // ⇧⏎ queues instead of playing; ⌥⏎ plays it next.
      run(rows[active], e.shiftKey ? 'queue' : e.altKey ? 'next' : 'play')
    } else if (e.key === 'Home') {
      e.preventDefault()
      setActive(0)
    } else if (e.key === 'End') {
      e.preventDefault()
      setActive(Math.max(0, rows.length - 1))
    }
  }

  let lastGroup = ''

  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center pt-[10vh] px-4">
      <Scrim onClose={closePanel} />
      <motion.div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        initial={{ opacity: 0, y: -16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -10, scale: 0.985 }}
        transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
        className="relative w-full max-w-xl glass raise-lg border border-line rounded-xl overflow-hidden flex flex-col max-h-[70vh]"
      >
        <div className="shrink-0 flex items-center gap-3 px-4 border-b border-line">
          <SearchIcon className="w-4 h-4 text-ink-faint shrink-0" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search tracks, or type a command…"
            aria-label="Command or search"
            className="flex-1 bg-transparent py-3.5 text-[15px] outline-none placeholder:text-ink-faint"
          />
          <kbd className="kbd shrink-0">esc</kbd>
        </div>

        <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto py-1.5">
          {rows.length === 0 && (
            <p className="label text-center py-8">Nothing matches “{query}”.</p>
          )}
          {rows.map((row, i) => {
            const group = row.kind === 'command' ? row.command.group : 'Tracks'
            const showGroup = group !== lastGroup
            lastGroup = group
            const isActive = i === active
            return (
              <div key={row.kind === 'command' ? row.command.id : `t-${row.track.id}`}>
                {showGroup && (
                  <p className="label px-4 pt-3 pb-1.5 !text-[9px]">{group}</p>
                )}
                <button
                  data-index={i}
                  onMouseMove={() => setActive(i)}
                  onClick={() => run(row)}
                  className={`w-full flex items-center gap-3 px-4 py-2 text-left transition-colors ${
                    isActive ? 'bg-surface' : ''
                  }`}
                >
                  <span
                    className={`w-7 h-7 shrink-0 grid place-items-center rounded-md ${
                      isActive ? 'text-signal bg-panel' : 'text-ink-faint'
                    }`}
                  >
                    {row.kind === 'command' ? row.command.icon : <PlayIcon className={ICON} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13.5px] leading-tight truncate">
                      <Highlight
                        text={row.kind === 'command' ? row.command.label : row.track.title}
                        positions={row.positions}
                      />
                    </span>
                    <span className="label block mt-0.5 normal-case tracking-normal truncate">
                      {row.kind === 'command'
                        ? row.command.hint
                        : `${row.track.artist} · ${row.track.album}`}
                    </span>
                  </span>
                  {row.kind === 'track' && (
                    <span className="readout label !text-[10px] shrink-0">
                      {fmtTime(row.track.duration)}
                    </span>
                  )}
                  {isActive && row.kind === 'track' && (
                    <PlayNextIcon className="w-3.5 h-3.5 text-ink-faint shrink-0" />
                  )}
                </button>
              </div>
            )
          })}
        </div>

        <div className="shrink-0 flex items-center gap-3 px-4 py-2 border-t border-line label !text-[9px]">
          <span className="flex items-center gap-1.5">
            <kbd className="kbd !h-5 !min-w-5 !text-[9px]">↑↓</kbd> move
          </span>
          <span className="flex items-center gap-1.5">
            <kbd className="kbd !h-5 !min-w-5 !text-[9px]">↵</kbd> play
          </span>
          <span className="hidden sm:flex items-center gap-1.5">
            <kbd className="kbd !h-5 !min-w-5 !text-[9px]">⇧↵</kbd> queue
          </span>
          <span className="hidden sm:flex items-center gap-1.5">
            <kbd className="kbd !h-5 !min-w-5 !text-[9px]">⌥↵</kbd> play next
          </span>
          <CommandIcon className="w-3.5 h-3.5 ml-auto opacity-50" />
        </div>
      </motion.div>
    </div>
  )
}

function Highlight({ text, positions }: { text: string; positions: number[] }) {
  const runs = highlightRuns(text, positions)
  return (
    <>
      {runs.map((r, i) =>
        r.hit ? (
          <mark key={i} className="bg-transparent text-signal font-semibold">
            {r.text}
          </mark>
        ) : (
          <span key={i}>{r.text}</span>
        )
      )}
    </>
  )
}

/** Where the palette can send you. Mirrors the Sidebar's own View union. */
export type NavTarget =
  | { kind: 'library' }
  | { kind: 'playlist'; id: string }
  | { kind: 'smart'; id: import('../types').SmartViewId }
