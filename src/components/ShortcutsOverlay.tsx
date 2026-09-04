import { useDeck } from '../store/deck'
import { Sheet } from './ui'
import { KeyboardIcon } from './icons'

/** The one canonical list. Anything bound in App.tsx should appear here. */
const GROUPS: { name: string; items: [string[], string][] }[] = [
  {
    name: 'Transport',
    items: [
      [['Space'], 'Play / pause'],
      [['→'], 'Forward 5 seconds'],
      [['←'], 'Back 5 seconds'],
      [['⇧', '→'], 'Next track'],
      [['⇧', '←'], 'Previous track'],
      [['↑'], 'Volume up'],
      [['↓'], 'Volume down'],
      [['M'], 'Mute'],
      [['S'], 'Shuffle'],
      [['R'], 'Repeat — off, all, one'],
      [['L'], 'A↔B loop — press twice'],
      [['0'], 'Back to the start'],
      [['1', '…', '9'], 'Jump to 10%…90%'],
    ],
  },
  {
    name: 'Panels',
    items: [
      [['⌘', 'K'], 'Command palette'],
      [['N'], 'Now playing'],
      [['Q'], 'Queue'],
      [['E'], 'Equalizer'],
      [['?'], 'This list'],
      [['Esc'], 'Close whatever is open'],
    ],
  },
  {
    name: 'Library',
    items: [
      [['/'], 'Search'],
      [['F'], 'Favourite the current track'],
      [['G'], 'Grid / list view'],
      [['T'], 'Light / dark'],
    ],
  },
]

export function ShortcutsOverlay() {
  const { closePanel } = useDeck()
  return (
    <Sheet
      title="Keyboard shortcuts"
      subtitle="Everything DECK does without the mouse"
      icon={<KeyboardIcon className="w-[18px] h-[18px]" />}
      onClose={closePanel}
      width="sm:max-w-2xl"
    >
      <div className="grid sm:grid-cols-2 gap-x-8">
        {GROUPS.map((group) => (
          <section key={group.name} className="mb-5 break-inside-avoid">
            <div className="flex items-center gap-3 mb-2">
              <span className="label">{group.name}</span>
              <span className="flex-1 rule" />
            </div>
            <dl>
              {group.items.map(([keys, description]) => (
                <div
                  key={description}
                  className="flex items-center justify-between gap-4 py-1.5 border-b border-line-soft last:border-0"
                >
                  <dt className="text-[13px] text-ink-dim min-w-0 truncate">{description}</dt>
                  <dd className="flex items-center gap-1 shrink-0">
                    {keys.map((k, i) => (
                      <kbd key={i} className="kbd">
                        {k}
                      </kbd>
                    ))}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
      <p className="label normal-case tracking-normal leading-relaxed">
        Shortcuts stand down while you’re typing in a field, and the transport
        keys ignore a focused button so Space doesn’t fire twice.
      </p>
    </Sheet>
  )
}
