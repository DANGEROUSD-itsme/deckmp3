import { useDJ } from '../../store/dj'
import { Slider } from '../ui'
import { VerticalFader } from './DjControls'

/** The centre column: master level and the crossfader between A and B. */
export function MixerStrip() {
  const { crossfader, setCrossfader, master, setMaster } = useDJ()

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
          <span className="label !text-[9px]">A</span>
          <span className="label !text-[9px]">CROSSFADER</span>
          <span className="label !text-[9px]">B</span>
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
    </div>
  )
}
