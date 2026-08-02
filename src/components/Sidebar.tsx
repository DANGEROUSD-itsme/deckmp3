import { useState } from 'react'
import { useDeck } from '../store/deck'
import { DiscIcon, FolderIcon, MoonIcon, PlusIcon, SunIcon } from './icons'

export type View = { kind: 'library' } | { kind: 'playlist'; id: string }

interface Props {
  view: View
  onNavigate: (v: View) => void
}

export function Sidebar({ view, onNavigate }: Props) {
  const { playlists, createPlaylist, chooseFolder, theme, toggleTheme } = useDeck()
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')

  const submit = async () => {
    const p = await createPlaylist(name || 'New playlist')
    setName('')
    setCreating(false)
    onNavigate({ kind: 'playlist', id: p.id })
  }

  return (
    <aside className="w-[76px] lg:w-[228px] shrink-0 border-r border-line bg-panel-deep flex flex-col">
      <div className="h-16 lg:h-[72px] flex items-center justify-center lg:justify-start lg:px-5 shrink-0 border-b border-line">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-full bg-signal grid place-items-center shrink-0">
            <div className="w-2 h-2 rounded-full bg-panel-deep" />
          </div>
          <span className="display-wide text-lg tracking-wide hidden lg:block">DECK</span>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto py-3 px-2 lg:px-3">
        <button
          onClick={() => onNavigate({ kind: 'library' })}
          className={`nav-item ${view.kind === 'library' ? 'nav-item-active' : ''}`}
        >
          <DiscIcon className="w-[18px] h-[18px] shrink-0" />
          <span className="hidden lg:inline">Library</span>
        </button>

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

        {creating && (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void submit()
            }}
            className="mb-2 hidden lg:block"
          >
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => name.trim() && void submit()}
              placeholder="Playlist name"
              className="w-full bg-surface rounded-sm px-2.5 py-1.5 text-sm outline-none border border-line focus:border-signal"
            />
          </form>
        )}

        {playlists.map((p) => (
          <button
            key={p.id}
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
        ))}
      </nav>

      <div className="p-2 lg:p-3 border-t border-line space-y-1">
        <button onClick={() => void chooseFolder()} className="nav-item" title="Change library folder">
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
