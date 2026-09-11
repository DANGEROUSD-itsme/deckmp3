import { useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { useDJ, type DeckState } from '../../store/dj'
import { djEngine, type DeckSide } from '../../lib/djEngine'
import { fmtTime } from '../../lib/format'
import { Cover } from '../Cover'
import { DjWaveform } from './DjWaveform'
import { DeckVu, VerticalFader } from './DjControls'
import { Slider } from '../ui'
import {
  FlagIcon,
  PauseIcon,
  PlayIcon,
  PrevIcon,
  SpeedIcon,
} from '../icons'

const TEMPO_RANGE = 0.25 // ±25%

function fmtPercent(rate: number) {
  const pct = Math.round((rate - 1) * 100)
  return pct === 0 ? '0%' : `${pct > 0 ? '+' : ''}${pct}%`
}

/**
 * Live position/duration readout. Writes straight to two text nodes from a
 * single rAF loop rather than going through React state — this changes every
 * frame, and `djEngine` is the same kind of source-of-truth-outside-React
 * that the main transport's Spectrum canvases already read directly.
 */
function DeckClock({ side }: { side: DeckSide }) {
  const posRef = useRef<HTMLSpanElement>(null)
  const remRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    let raf = 0
    const tick = () => {
      raf = requestAnimationFrame(tick)
      const pos = djEngine.position[side]
      const dur = djEngine.duration[side]
      if (posRef.current) posRef.current.textContent = fmtTime(pos)
      if (remRef.current) {
        remRef.current.textContent = dur ? `\u2212${fmtTime(Math.max(0, dur - pos))}` : '\u2014:\u2014'
      }
    }
    tick()
    return () => cancelAnimationFrame(raf)
  }, [side])

  return (
    <div className="flex items-center gap-2 readout text-[11px] tabular-nums">
      <span ref={posRef}>0:00</span>
      <span className="text-ink-faint">/</span>
      <span ref={remRef} className="text-ink-faint">
        \u2014:\u2014
      </span>
    </div>
  )
}

export function DeckPanel({ side }: { side: DeckSide }) {
  const dj = useDJ()
  const deck: DeckState = dj.decks[side]
  const other: DeckSide = side === 'a' ? 'b' : 'a'

  const label = side.toUpperCase()
  const empty = !deck.trackId

  const startBend = (dir: -1 | 1) => {
    dj.bend(side, dir)
  }
  const endBend = () => dj.bend(side, 0)

  return (
    <div className="flex flex-col gap-3 w-full sm:w-[300px] shrink-0">
      {/* Identity */}
      <div className="flex items-center gap-3">
        <span
          className={`w-7 h-7 shrink-0 rounded-md grid place-items-center display-wide text-[13px] ${
            deck.playing ? 'bg-signal text-white' : 'bg-surface text-ink-dim'
          }`}
        >
          {label}
        </span>
        <div className="w-10 h-10 shrink-0 rounded-[3px] overflow-hidden well">
          <Cover artKey={deck.artKey} title={deck.title} className="w-full h-full" rounded="rounded-[3px]" />
        </div>
        <div className="min-w-0 flex-1">
          {empty ? (
            <p className="label normal-case tracking-normal">No track loaded</p>
          ) : (
            <>
              <p className="text-[13px] leading-tight truncate">{deck.title}</p>
              <p className="label !text-[9px] mt-0.5 truncate normal-case tracking-normal">
                {deck.artist}
              </p>
            </>
          )}
        </div>
      </div>

      {/* Waveform */}
      <DjWaveform
        side={side}
        peaks={deck.peaks}
        cue={deck.cue}
        onSeek={(ratio) => dj.seek(side, ratio * deck.duration)}
      />
      <div className="flex items-center justify-between -mt-1.5">
        <DeckClock side={side} />
        {deck.tappedBpm && (
          <span className="readout label !text-[9px] tabular-nums">{deck.tappedBpm.toFixed(1)} BPM</span>
        )}
      </div>

      {/* Transport */}
      <div className="flex items-center justify-center gap-2">
        <button
          onClick={() => dj.setCue(side)}
          disabled={empty}
          className="control-btn w-8 h-8 disabled:opacity-30"
          aria-label={`Set cue point for deck ${label}`}
          title="Set cue here"
        >
          <FlagIcon className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => dj.jumpToCue(side)}
          disabled={empty}
          className="ghost-btn !py-1.5 !px-3 disabled:opacity-30"
          title="Jump to cue"
        >
          CUE
        </button>
        <button
          onPointerDown={() => startBend(-1)}
          onPointerUp={endBend}
          onPointerLeave={endBend}
          disabled={empty}
          className="control-btn w-8 h-8 disabled:opacity-30"
          aria-label="Pitch bend down"
          title="Hold to nudge slower"
        >
          <PrevIcon className="w-4 h-4" />
        </button>
        <motion.button
          onClick={() => dj.toggle(side)}
          disabled={empty}
          whileTap={{ scale: 0.92 }}
          className="control-btn-main w-11 h-11 disabled:opacity-30"
          aria-label={deck.playing ? `Pause deck ${label}` : `Play deck ${label}`}
        >
          {deck.playing ? (
            <PauseIcon className="w-5 h-5" />
          ) : (
            <PlayIcon className="w-5 h-5 translate-x-[1px]" />
          )}
        </motion.button>
        <button
          onPointerDown={() => startBend(1)}
          onPointerUp={endBend}
          onPointerLeave={endBend}
          disabled={empty}
          className="control-btn w-8 h-8 disabled:opacity-30"
          aria-label="Pitch bend up"
          title="Hold to nudge faster"
        >
          <PrevIcon className="w-4 h-4 rotate-180" />
        </button>
      </div>

      {/* Tempo */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="label !text-[9px] flex items-center gap-1.5">
            <SpeedIcon className="w-3 h-3" />
            Tempo
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => dj.toggleKeyLock(side)}
              className={`label !text-[9px] px-1.5 py-0.5 rounded border transition-colors ${
                deck.keylock
                  ? 'border-signal text-signal'
                  : 'border-line text-ink-faint hover:text-ink-dim'
              }`}
              title="Key lock — keep pitch constant across tempo changes"
            >
              KEY
            </button>
            <span className="readout label !text-[9px] w-9 text-right">{fmtPercent(deck.rate)}</span>
          </div>
        </div>
        <Slider
          value={deck.rate}
          min={1 - TEMPO_RANGE}
          max={1 + TEMPO_RANGE}
          step={0.001}
          resetTo={1}
          onChange={(v) => dj.setRate(side, v)}
          label={`Deck ${label} tempo`}
        />
        <div className="flex items-center gap-1.5">
          <button onClick={() => dj.tapTempo(side)} className="ghost-btn flex-1 !py-1 !text-[10.5px]">
            TAP
          </button>
          <button
            onClick={() => dj.matchTempo(side)}
            className="ghost-btn flex-1 !py-1 !text-[10.5px]"
            title={`Match this deck's tempo to deck ${other.toUpperCase()}`}
          >
            SYNC
          </button>
        </div>
      </div>

      {/* EQ */}
      <div className="flex items-center justify-center gap-4 py-1">
        <VerticalFader
          value={deck.eq.high}
          min={-26}
          max={6}
          zero={0}
          resetTo={0}
          onChange={(v) => dj.setEq(side, 'high', v)}
          label="HI"
          ariaLabel={`Deck ${label} high EQ`}
          height={92}
        />
        <VerticalFader
          value={deck.eq.mid}
          min={-26}
          max={6}
          zero={0}
          resetTo={0}
          onChange={(v) => dj.setEq(side, 'mid', v)}
          label="MID"
          ariaLabel={`Deck ${label} mid EQ`}
          height={92}
        />
        <VerticalFader
          value={deck.eq.low}
          min={-26}
          max={6}
          zero={0}
          resetTo={0}
          onChange={(v) => dj.setEq(side, 'low', v)}
          label="LOW"
          ariaLabel={`Deck ${label} low EQ`}
          height={92}
        />
      </div>

      {/* Filter + trim */}
      <div className="space-y-2.5">
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="label !text-[9px]">Filter</span>
            <span className="label !text-[9px] text-ink-faint">
              {deck.filter < -0.02 ? 'LPF' : deck.filter > 0.02 ? 'HPF' : 'off'}
            </span>
          </div>
          <Slider
            value={deck.filter}
            min={-1}
            max={1}
            step={0.01}
            resetTo={0}
            onChange={(v) => dj.setFilter(side, v)}
            label={`Deck ${label} filter`}
          />
        </div>
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="label !text-[9px]">Trim</span>
            <span className="readout label !text-[9px]">
              {deck.trim > 0 ? '+' : ''}
              {deck.trim.toFixed(1)}
            </span>
          </div>
          <Slider
            value={deck.trim}
            min={-12}
            max={12}
            step={0.1}
            resetTo={0}
            onChange={(v) => dj.setTrim(side, v)}
            label={`Deck ${label} trim`}
          />
        </div>
      </div>

      {/* Channel fader + VU */}
      <div className="flex items-center justify-center gap-3 pt-1">
        <VerticalFader
          value={deck.fader}
          min={0}
          max={1}
          resetTo={1}
          onChange={(v) => dj.setFader(side, v)}
          label="LEVEL"
          ariaLabel={`Deck ${label} channel fader`}
          height={110}
        />
        <DeckVu side={side} active={deck.playing} height={110} />
      </div>
    </div>
  )
}
