import { useRef } from 'react'
import { motion } from 'framer-motion'
import { useDeck } from '../store/deck'
import { EQ_FREQUENCIES, EQ_PRESETS } from '../types'
import { fmtDb, fmtRate } from '../lib/format'
import { Row, SectionLabel, Sheet, Slider, Toggle } from './ui'
import { BalanceIcon, CompressIcon, SlidersIcon, SpeedIcon } from './icons'

const RANGE = 12 // ± dB on every band

/**
 * The tone stack. Ten vertical faders, a preamp trim, and the three
 * single-knob processors that sit after the EQ in the graph.
 *
 * Faders are drawn rather than <input type=range rotated>: a rotated native
 * range control cannot be styled consistently across engines, and dragging a
 * rotated hit area is genuinely worse on touch.
 */
export function EqualizerPanel() {
  const { closePanel, settings, setEq, applyEqPreset, updateSettings } = useDeck()
  const { eq } = settings

  const setBand = (index: number, db: number) => {
    const bands = [...eq.bands]
    bands[index] = Math.max(-RANGE, Math.min(RANGE, db))
    setEq({ bands, preset: 'Custom', enabled: true })
  }

  return (
    <Sheet
      title="Equalizer"
      subtitle="Ten bands, a preamp, and the processors after them"
      icon={<SlidersIcon className="w-[18px] h-[18px]" />}
      onClose={closePanel}
      width="sm:max-w-2xl"
      footer={
        <>
          <button onClick={() => applyEqPreset('Flat')} className="ghost-btn">
            Reset to flat
          </button>
          <button onClick={closePanel} className="pill-btn !py-2 !px-5">
            Done
          </button>
        </>
      }
    >
      <Row
        title="Equalizer"
        hint={eq.enabled ? `Active — ${eq.preset}` : 'Bypassed, all bands flat'}
      >
        <Toggle on={eq.enabled} onChange={(v) => setEq({ enabled: v })} label="Equalizer" />
      </Row>

      <SectionLabel>Presets</SectionLabel>
      <div className="flex flex-wrap gap-1.5">
        {EQ_PRESETS.map((p) => (
          <button
            key={p.name}
            onClick={() => applyEqPreset(p.name)}
            className={`px-3 py-1.5 rounded-full text-[12.5px] border transition-colors ${
              eq.preset === p.name
                ? 'border-signal text-signal bg-[color-mix(in_srgb,var(--signal)_12%,transparent)]'
                : 'border-line text-ink-dim hover:text-ink hover:border-ink-faint'
            }`}
          >
            {p.name}
          </button>
        ))}
        {eq.preset === 'Custom' && (
          <span className="px-3 py-1.5 rounded-full text-[12.5px] border border-signal text-signal">
            Custom
          </span>
        )}
      </div>

      <SectionLabel>Bands</SectionLabel>
      <div
        className={`well rounded-lg bg-surface px-3 py-4 transition-opacity ${
          eq.enabled ? '' : 'opacity-45'
        }`}
      >
        <div className="flex items-end justify-between gap-1 sm:gap-2">
          {EQ_FREQUENCIES.map((freq, i) => (
            <Fader
              key={freq}
              value={eq.bands[i] ?? 0}
              onChange={(v) => setBand(i, v)}
              label={freq >= 1000 ? `${freq / 1000}k` : `${freq}`}
            />
          ))}
        </div>
        {/* 0 dB reference line, drawn under the faders like a printed scale. */}
        <div className="mt-3 flex items-center gap-2">
          <span className="label !text-[9px]">−12</span>
          <span className="flex-1 rule" />
          <span className="label !text-[9px]">0 dB</span>
          <span className="flex-1 rule" />
          <span className="label !text-[9px]">+12</span>
        </div>
      </div>

      <Row title="Preamp" hint="Pull this down when you boost a lot of bands">
        <Slider
          value={eq.preamp}
          min={-12}
          max={12}
          step={0.5}
          resetTo={0}
          onChange={(v) => setEq({ preamp: v })}
          label="Preamp"
          format={(v) => `${fmtDb(v)} dB`}
        />
      </Row>

      <SectionLabel>After the EQ</SectionLabel>

      <Row
        title="Night mode"
        hint="Compresses the loud parts so quiet passages stay audible"
      >
        <span className="text-ink-faint">
          <CompressIcon className="w-4 h-4" />
        </span>
        <Toggle
          on={settings.nightMode}
          onChange={(v) => updateSettings({ nightMode: v })}
          label="Night mode"
        />
      </Row>

      <Row title="Balance" hint="Double-click the slider to recentre">
        <span className="text-ink-faint">
          <BalanceIcon className="w-4 h-4" />
        </span>
        <Slider
          value={settings.balance}
          min={-1}
          max={1}
          step={0.05}
          resetTo={0}
          onChange={(v) => updateSettings({ balance: v })}
          label="Balance"
          format={(v) =>
            Math.abs(v) < 0.03 ? 'centre' : `${v < 0 ? 'L' : 'R'} ${Math.round(Math.abs(v) * 100)}`
          }
        />
      </Row>

      <Row title="Speed" hint="Pitch lock lives in Vibe Mode, if you want it to shift too">
        <span className="text-ink-faint">
          <SpeedIcon className="w-4 h-4" />
        </span>
        <Slider
          value={settings.rate}
          min={0.5}
          max={2}
          step={0.05}
          resetTo={1}
          onChange={(v) => updateSettings({ rate: v })}
          label="Playback speed"
          format={fmtRate}
        />
      </Row>
    </Sheet>
  )
}

/** One vertical band fader. Drag, or use the arrow keys once focused. */
function Fader({
  value,
  onChange,
  label,
}: {
  value: number
  onChange: (v: number) => void
  label: string
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  // 0 dB sits in the middle; the fill grows up or down from there.
  const ratio = (value + RANGE) / (RANGE * 2)

  const apply = (clientY: number) => {
    const el = trackRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const r = 1 - Math.max(0, Math.min(1, (clientY - rect.top) / rect.height))
    onChange(Math.round((r * RANGE * 2 - RANGE) * 2) / 2)
  }

  return (
    <div className="flex flex-col items-center gap-2 flex-1 min-w-0">
      <span
        className={`readout text-[10px] tabular-nums ${
          Math.abs(value) < 0.05 ? 'text-ink-faint' : 'text-signal'
        }`}
      >
        {fmtDb(value)}
      </span>
      <div
        ref={trackRef}
        role="slider"
        aria-label={`${label} hertz`}
        aria-valuemin={-RANGE}
        aria-valuemax={RANGE}
        aria-valuenow={value}
        tabIndex={0}
        onDoubleClick={() => onChange(0)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp') {
            e.preventDefault()
            onChange(Math.min(RANGE, value + 0.5))
          } else if (e.key === 'ArrowDown') {
            e.preventDefault()
            onChange(Math.max(-RANGE, value - 0.5))
          } else if (e.key === 'Home' || e.key === 'End') {
            e.preventDefault()
            onChange(0)
          }
        }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          apply(e.clientY)
        }}
        onPointerMove={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) apply(e.clientY)
        }}
        onPointerUp={(e) => e.currentTarget.releasePointerCapture(e.pointerId)}
        className="relative h-32 sm:h-40 w-7 grid place-items-center cursor-ns-resize touch-none outline-none group"
      >
        <div className="fader h-full" />
        {/* Centre detent mark. */}
        <div className="absolute left-1/2 -translate-x-1/2 top-1/2 w-3.5 h-px bg-line" />
        <div
          className="absolute left-1/2 -translate-x-1/2 w-[6px] rounded-full bg-signal"
          style={{
            bottom: `${Math.min(ratio, 0.5) * 100}%`,
            height: `${Math.abs(ratio - 0.5) * 100}%`,
          }}
        />
        <motion.div
          className="absolute left-1/2 -translate-x-1/2 w-5 h-3 rounded-[3px] bg-ink shadow-[0_1px_4px_rgb(0_0_0/0.5)] border-t border-white/25 group-hover:scale-110 group-focus-visible:scale-110 transition-transform"
          animate={{ bottom: `calc(${ratio * 100}% - 6px)` }}
          transition={{ type: 'spring', stiffness: 700, damping: 45 }}
        />
      </div>
      <span className="label !text-[8.5px] !tracking-[0.06em]">{label}</span>
    </div>
  )
}
