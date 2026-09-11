import { useState } from 'react'
import { motion } from 'framer-motion'
import { useDJ } from '../../store/dj'
import { Segmented, Slider } from '../ui'
import { VerticalFader } from './DjControls'
import { SparkIcon } from '../icons'

const DURATIONS: { id: '4' | '8' | '16'; label: string; seconds: number }[] = [
  { id: '4', label: '4s', seconds: 4 },
  { id: '8', label: '8s', seconds: 8 },
  { id: '16', label: '16s', seconds: 16 },
]

/** The centre column: master level, the crossfader, and Auto Mix. */
export function MixerStrip() {
  const { crossfader, setCrossfader, master, setMaster, autoMix, startAutoMix, cancelAutoMix } =
    useDJ()
  const [duration, setDuration] = useState<'4' | '8' | '16'>('8')

  return (
    <div className="flex flex-col items-center gap-5 shrink-0 px-2">
      <VerticalFader
        value={master}
        min={0}
        max={1}
        resetTo={0.85}
        onChange={setMaster}
        label="MASTER"
        height={140}
      />

      <div className="w-36 sm:w-44">
        <div className="flex items-center justify-between mb-1.5">
          <span className={`label !text-[9px] ${autoMix?.to === 'a' ? 'text-signal' : ''}`}>
            A
          </span>
          <span className="label !text-[9px]">CROSSFADER</span>
          <span className={`label !text-[9px] ${autoMix?.to === 'b' ? 'text-signal' : ''}`}>
            B
          </span>
        </div>
        <Slider
          value={crossfader}
          min={0}
          max={1}
          step={0.005}
          resetTo={0.5}
          onChange={setCrossfader}
          label="Crossfader"
          accent={false}
        />
      </div>

      {/* Auto Mix: beatmatch (if both decks have a tapped tempo) then blend
          the crossfader across with a bass swap, hands-free. */}
      <div className="w-36 sm:w-44 pt-1 border-t border-line">
        {autoMix ? (
          <div className="pt-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="label !text-[9px] text-signal">
                Mixing {autoMix.from.toUpperCase()} → {autoMix.to.toUpperCase()}
              </span>
              <span className="readout label !text-[9px]">{Math.round(autoMix.progress * 100)}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-line overflow-hidden mb-2.5">
              <motion.div
                className="h-full bg-signal rounded-full"
                animate={{ width: `${autoMix.progress * 100}%` }}
                transition={{ duration: 0.1, ease: 'linear' }}
              />
            </div>
            <button onClick={cancelAutoMix} className="ghost-btn w-full justify-center">
              Take over manually
            </button>
          </div>
        ) : (
          <div className="pt-3 space-y-2">
            <Segmented<'4' | '8' | '16'>
              label="Auto mix length"
              value={duration}
              onChange={setDuration}
              options={DURATIONS.map((d) => ({ id: d.id, label: d.label }))}
            />
            <button
              onClick={() => startAutoMix(DURATIONS.find((d) => d.id === duration)!.seconds)}
              className="pill-btn w-full justify-center !py-2"
            >
              <SparkIcon className="w-3.5 h-3.5" />
              Auto Mix
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
