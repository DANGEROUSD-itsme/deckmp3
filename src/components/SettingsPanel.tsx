import { useState } from 'react'
import { useDeck } from '../store/deck'
import {
  ACCENTS,
  DECK_CODENAME,
  DECK_VERSION,
  VISUALIZER_MODES,
  type AccentName,
  type Density,
  type ThemeMode,
  type VisualizerMode,
} from '../types'
import { Row, SectionLabel, Segmented, Sheet, Slider, Toggle } from './ui'
import { CloudIcon, GearIcon, MoonIcon, SunIcon, WaveIcon } from './icons'

/**
 * Sign-in + sync status. Entirely optional — `syncAvailable` is false on any
 * build with no Supabase project wired up, and this whole section just
 * doesn't render then. Signing in only syncs metadata (playlists, ratings,
 * settings); your actual audio files never leave the device.
 */
function AccountSection() {
  const { syncAvailable, syncStatus, syncEmail, signInWithEmail, signOut } = useDeck()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (!syncAvailable) return null

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim() || busy) return
    setBusy(true)
    setError(null)
    const { error: err } = await signInWithEmail(email.trim())
    setBusy(false)
    if (err) setError(err)
    else setSent(true)
  }

  return (
    <>
      <SectionLabel>Account &amp; sync</SectionLabel>

      {syncEmail ? (
        <>
          <Row
            title="Signed in"
            hint={
              syncStatus === 'syncing'
                ? 'Syncing…'
                : syncStatus === 'error'
                  ? 'Last sync failed — will retry on your next change'
                  : `Synced as ${syncEmail}`
            }
          >
            <span className="text-ink-faint">
              <CloudIcon className="w-4 h-4" />
            </span>
            <button onClick={() => void signOut()} className="ghost-btn">
              Sign out
            </button>
          </Row>
        </>
      ) : (
        <Row
          title="Sync across devices"
          hint={
            sent
              ? `Check ${email} for a sign-in link`
              : 'Playlists, ratings, presets and settings — your music files always stay local'
          }
        >
          {sent ? (
            <button onClick={() => setSent(false)} className="ghost-btn">
              Use a different email
            </button>
          ) : (
            <form onSubmit={submit} className="flex items-center gap-1.5 min-w-0">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="field !w-auto !py-1.5 min-w-0"
                aria-label="Email for sync sign-in"
              />
              <button type="submit" disabled={busy} className="ghost-btn shrink-0">
                {busy ? 'Sending…' : 'Send link'}
              </button>
            </form>
          )}
        </Row>
      )}
      {error && <p className="label mt-1 !text-[10px] normal-case tracking-normal text-red-500">{error}</p>}
    </>
  )
}

/**
 * Every preference in one sheet. Changes apply live — there is no Save
 * button, because nothing here is destructive and a setting you can't hear
 * or see immediately is a setting you can't judge.
 */
export function SettingsPanel() {
  const {
    closePanel,
    settings,
    updateSettings,
    ask,
    forgetLibrary,
    resetStats,
    rescan,
    supported,
    tracks,
  } = useDeck()

  return (
    <Sheet
      title="Settings"
      subtitle={`DECK v${DECK_VERSION} “${DECK_CODENAME}”`}
      icon={<GearIcon className="w-[18px] h-[18px]" />}
      onClose={closePanel}
      width="sm:max-w-xl"
    >
      <AccountSection />

      <SectionLabel>Appearance</SectionLabel>

      <Row title="Theme" hint="System follows your OS as it changes">
        <Segmented<ThemeMode>
          label="Theme"
          value={settings.theme}
          onChange={(theme) => updateSettings({ theme })}
          options={[
            { id: 'light', label: 'Light', icon: <SunIcon className="w-3.5 h-3.5" /> },
            { id: 'dark', label: 'Dark', icon: <MoonIcon className="w-3.5 h-3.5" /> },
            { id: 'system', label: 'Auto' },
          ]}
        />
      </Row>

      <Row title="Accent" hint="The one colour that means “live”">
        <div className="flex items-center gap-1.5">
          {ACCENTS.map((a) => (
            <button
              key={a.id}
              onClick={() => updateSettings({ accent: a.id as AccentName })}
              aria-label={a.label}
              aria-pressed={settings.accent === a.id}
              title={a.label}
              className={`w-6 h-6 rounded-full transition-transform ${
                settings.accent === a.id
                  ? 'ring-2 ring-offset-2 ring-ink scale-110'
                  : 'hover:scale-110'
              }`}
              style={{
                background: a.dark,
                // The ring offset has to match the sheet, not the page.
                ['--tw-ring-offset-color' as string]: 'var(--glass)',
              }}
            />
          ))}
        </div>
      </Row>

      <Row title="Density" hint="Compact fits about a third more rows on screen">
        <Segmented<Density>
          label="Density"
          value={settings.density}
          onChange={(density) => updateSettings({ density })}
          options={[
            { id: 'comfortable', label: 'Comfortable' },
            { id: 'compact', label: 'Compact' },
          ]}
        />
      </Row>

      <Row title="Album tile size" hint="Minimum width of a cover in the grid">
        <Slider
          value={settings.gridSize}
          min={110}
          max={260}
          step={2}
          resetTo={168}
          onChange={(gridSize) => updateSettings({ gridSize })}
          label="Album tile size"
          format={(v) => `${Math.round(v)}px`}
        />
      </Row>

      <Row title="Animate lists" hint="Turn off for very large libraries">
        <Toggle
          on={settings.listAnimation}
          onChange={(listAnimation) => updateSettings({ listAnimation })}
          label="Animate lists"
        />
      </Row>

      <SectionLabel>Now playing</SectionLabel>

      <Row title="Visualizer" hint={VISUALIZER_MODES.find((m) => m.id === settings.visualizer)?.hint}>
        <select
          value={settings.visualizer}
          onChange={(e) => updateSettings({ visualizer: e.target.value as VisualizerMode })}
          className="field !w-auto !py-1.5 cursor-pointer"
          aria-label="Visualizer mode"
        >
          {VISUALIZER_MODES.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </Row>

      <Row title="Ambient artwork" hint="Tint the backdrop with the cover’s own colour">
        <Toggle
          on={settings.ambientArt}
          onChange={(ambientArt) => updateSettings({ ambientArt })}
          label="Ambient artwork"
        />
      </Row>

      <Row title="Spectrum strip" hint="The live analyser under the transport bar">
        <span className="text-ink-faint">
          <WaveIcon className="w-4 h-4" />
        </span>
        <Toggle
          on={settings.spectrumStrip}
          onChange={(spectrumStrip) => updateSettings({ spectrumStrip })}
          label="Spectrum strip"
        />
      </Row>

      <SectionLabel>Playback</SectionLabel>

      <Row
        title="Crossfade"
        hint="Overlap between tracks. A short one hides MP3 encoder padding."
      >
        <Slider
          value={settings.crossfade}
          min={0}
          max={12}
          step={0.02}
          resetTo={0.14}
          onChange={(crossfade) => updateSettings({ crossfade })}
          label="Crossfade"
          format={(v) => (v < 0.05 ? 'off' : `${v.toFixed(2)}s`)}
        />
      </Row>

      <Row title="Smooth pause" hint="Fade in and out instead of cutting">
        <Toggle
          on={settings.smoothPause}
          onChange={(smoothPause) => updateSettings({ smoothPause })}
          label="Smooth pause"
        />
      </Row>

      <Row title="Resume on launch" hint="Reopen with the same queue and playhead">
        <Toggle
          on={settings.resumeOnLaunch}
          onChange={(resumeOnLaunch) => updateSettings({ resumeOnLaunch })}
          label="Resume on launch"
        />
      </Row>

      <Row title="Count a play after" hint="How long you have to stay with a track">
        <Slider
          value={settings.scrobbleAt}
          min={5}
          max={120}
          step={1}
          resetTo={20}
          onChange={(scrobbleAt) => updateSettings({ scrobbleAt })}
          label="Count a play after"
          format={(v) => `${Math.round(v)}s`}
        />
      </Row>

      <SectionLabel>Library</SectionLabel>

      <Row title="Tracks" hint={supported ? 'Live folder access' : 'Copied into local storage'}>
        <span className="readout text-sm">{tracks.length}</span>
      </Row>

      <Row title="Rescan" hint="Pick up files added outside DECK">
        <button onClick={() => void rescan()} className="ghost-btn">
          Rescan now
        </button>
      </Row>

      <Row title="Listening history" hint="Play counts, favourites and ratings">
        <button
          onClick={() =>
            ask({
              title: 'Clear listening history?',
              body: 'Play counts, favourites and ratings are deleted. Your tracks and playlists stay exactly where they are.',
              confirmLabel: 'Clear history',
              destructive: true,
              run: resetStats,
            })
          }
          className="ghost-btn ghost-btn-danger"
        >
          Clear history
        </button>
      </Row>

      <Row title="Library" hint="Removes tracks and artwork; history is kept">
        <button
          onClick={() =>
            ask({
              title: 'Clear the library?',
              body: 'Every track and cover DECK has cached is removed and you’ll pick a folder again. Your actual music files are never touched, and your listening history is kept.',
              confirmLabel: 'Clear library',
              destructive: true,
              run: forgetLibrary,
            })
          }
          className="ghost-btn ghost-btn-danger"
        >
          Clear library
        </button>
      </Row>
    </Sheet>
  )
}
