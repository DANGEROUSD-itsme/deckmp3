import { useDeck } from '../store/deck'
import { VIBE_PRESETS } from '../types'
import { Row, SectionLabel, Sheet, Slider, Toggle } from './ui'
import { CompressIcon, SpeedIcon, VibeIcon } from './icons'

/**
 * The second listening mode: one always-on effects colour for ordinary
 * playback — reverb, bitcrush, distortion, a sweep filter, and the tempo
 * slider that (with pitch lock off) is what actually makes "slowed" or
 * "nightcore" sound like those things rather than a transparent speed
 * change. Distinct from DJ mode: one track, no decks, no crossfader.
 */
export function VibePanel() {
  const { closePanel, settings, updateSettings, updateVibe, applyVibePreset } = useDeck()
  const { vibe } = settings

  const tweak = (patch: Partial<typeof vibe>) =>
    updateVibe({ ...patch, preset: 'Custom', enabled: true })

  const setTempo = (rate: number) => {
    updateSettings({ rate })
    updateVibe({ preset: 'Custom' })
  }

  return (
    <Sheet
      title="Vibe Mode"
      subtitle="Slowed, sped up, crushed, drowned — a second way to hear your library"
      icon={<VibeIcon className="w-[18px] h-[18px]" />}
      onClose={closePanel}
      width="sm:max-w-lg"
      footer={
        <>
          <button onClick={() => applyVibePreset('Off')} className="ghost-btn">
            Reset
          </button>
          <button onClick={closePanel} className="pill-btn !py-2 !px-5">
            Done
          </button>
        </>
      }
    >
      <Row
        title="Vibe Mode"
        hint={vibe.enabled ? `Active — ${vibe.preset}` : 'Off — playing normally'}
      >
        <Toggle
          on={vibe.enabled}
          onChange={(v) => updateVibe({ enabled: v })}
          label="Vibe Mode"
        />
      </Row>

      <SectionLabel>Presets</SectionLabel>
      <div className="flex flex-wrap gap-1.5">
        {VIBE_PRESETS.map((p) => (
          <button
            key={p.name}
            onClick={() => applyVibePreset(p.name)}
            className={`px-3 py-1.5 rounded-full text-[12.5px] border transition-colors ${
              vibe.preset === p.name
                ? 'border-signal text-signal bg-[color-mix(in_srgb,var(--signal)_12%,transparent)]'
                : 'border-line text-ink-dim hover:text-ink hover:border-ink-faint'
            }`}
          >
            {p.name}
          </button>
        ))}
        {vibe.preset === 'Custom' && (
          <span className="px-3 py-1.5 rounded-full text-[12.5px] border border-signal text-signal">
            Custom
          </span>
        )}
      </div>

      <SectionLabel>Tempo &amp; pitch</SectionLabel>

      <Row title="Tempo" hint="0.5×…2×. Double-click the slider to reset">
        <span className="text-ink-faint">
          <SpeedIcon className="w-4 h-4" />
        </span>
        <Slider
          value={settings.rate}
          min={0.5}
          max={2}
          step={0.01}
          resetTo={1}
          onChange={setTempo}
          label="Tempo"
          format={(v) => `${v.toFixed(2)}×`}
        />
      </Row>

      <Row
        title="Lock pitch"
        hint={
          settings.pitchLock
            ? 'On — tempo changes without changing pitch'
            : 'Off — pitch follows tempo, like a tape or a turntable'
        }
      >
        <Toggle
          on={settings.pitchLock}
          onChange={(v) => updateSettings({ pitchLock: v })}
          label="Lock pitch"
        />
      </Row>

      {/* Dimmed rather than hidden when off — the values are still there,
          the engine just isn't applying them, same treatment as the EQ
          panel's band faders under its own enabled toggle. */}
      <div className={`transition-opacity ${vibe.enabled ? '' : 'opacity-45'}`}>
        <SectionLabel>Reverb</SectionLabel>

        <Row title="Amount" hint="How much of the wet signal to add back in">
          <Slider
            value={vibe.reverbWet}
            min={0}
            max={1}
            step={0.01}
            resetTo={0}
            onChange={(v) => tweak({ reverbWet: v })}
            label="Reverb amount"
            format={(v) => `${Math.round(v * 100)}%`}
          />
        </Row>

        <Row title="Decay" hint="How long the tail rings out">
          <Slider
            value={vibe.reverbDecay}
            min={0.3}
            max={6}
            step={0.1}
            resetTo={2}
            onChange={(v) => tweak({ reverbDecay: v })}
            label="Reverb decay"
            format={(v) => `${v.toFixed(1)}s`}
          />
        </Row>

        <SectionLabel>Character</SectionLabel>

        <Row title="Crush" hint="Bit depth and sample rate, ground down">
          <Slider
            value={vibe.crush}
            min={0}
            max={1}
            step={0.01}
            resetTo={0}
            onChange={(v) => tweak({ crush: v })}
            label="Crush"
            format={(v) => `${Math.round(v * 100)}%`}
          />
        </Row>

        <Row title="Distortion" hint="Drive it into the red">
          <span className="text-ink-faint">
            <CompressIcon className="w-4 h-4" />
          </span>
          <Slider
            value={vibe.distortion}
            min={0}
            max={1}
            step={0.01}
            resetTo={0}
            onChange={(v) => tweak({ distortion: v })}
            label="Distortion"
            format={(v) => `${Math.round(v * 100)}%`}
          />
        </Row>

        <Row title="Filter" hint="Left for underwater, right for telephone">
          <Slider
            value={vibe.filter}
            min={-1}
            max={1}
            step={0.01}
            resetTo={0}
            onChange={(v) => tweak({ filter: v })}
            label="Filter"
            format={(v) => (v < -0.02 ? 'LPF' : v > 0.02 ? 'HPF' : 'off')}
          />
        </Row>
      </div>
    </Sheet>
  )
}
