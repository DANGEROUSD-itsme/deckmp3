import { Sheet, SectionLabel } from '../ui'
import { HelpIcon } from '../icons'

/**
 * The cheat sheet. Written for someone who has never touched a mixer —
 * DECK's own DJ mode has no headphone cue and no beat-grid, so the advice
 * here is scoped to what the app can actually do, not general DJ theory.
 */
export function DjHelp({ onClose }: { onClose: () => void }) {
  return (
    <Sheet
      title="How to mix"
      subtitle="Everything below works on this mixer specifically"
      icon={<HelpIcon className="w-[18px] h-[18px]" />}
      onClose={onClose}
      width="sm:max-w-lg"
      footer={
        <button onClick={onClose} className="pill-btn !py-2 !px-5">
          Got it
        </button>
      }
    >
      <div className="rounded-lg bg-surface border border-line px-4 py-3.5">
        <p className="text-[13px] leading-relaxed">
          <span className="text-signal font-medium">Fastest path:</span> load a
          track on each deck, hit play on one, then press{' '}
          <span className="text-signal font-medium">Auto Mix</span>. It blends
          the crossfader across and swaps the bass for you — that alone gets
          you a clean transition with zero manual mixing.
        </p>
      </div>

      <SectionLabel>Doing it by hand</SectionLabel>
      <ol className="space-y-2.5 text-[13px] leading-relaxed list-decimal list-inside">
        <li>
          <b>Load two tracks.</b> "Load a track" in the header, pick one for
          Deck A, another for Deck B.
        </li>
        <li>
          <b>Play A, cue up B.</b> Crossfader all the way to A, hit play.
          Watch B's waveform for a clean spot to bring it in — usually right
          at the start of a phrase.
        </li>
        <li>
          <b>Match the tempo.</b> Tap <b>TAP</b> a few times in time with each
          deck's beat, then hit <b>SYNC</b> on the deck you're bringing in —
          it nudges that deck's tempo to match the other.
        </li>
        <li>
          <b>Bring B in.</b> Play B, then drag the crossfader from A toward
          B over a few bars. That drag is the mix.
        </li>
        <li>
          <b>Swap the bass as you cross.</b> Pull A's <b>LOW</b> down while
          B's <b>LOW</b> comes up. This is most of what makes a transition
          sound clean instead of muddy — Auto Mix does exactly this move.
        </li>
      </ol>

      <SectionLabel>What each control does</SectionLabel>
      <dl className="space-y-2 text-[13px]">
        <Row term="CUE / flag">
          Flag marks the current spot; CUE jumps back to it and stops. Use it
          to always land on "the good part" instantly.
        </Row>
        <Row term="TEMPO + KEY">
          Speeds up or slows down the deck. KEY LOCK keeps the pitch from
          shifting with it — off, it behaves like a real turntable (faster =
          higher pitched).
        </Row>
        <Row term="FILTER">
          One knob: sweep left and only the bass survives, sweep right and
          only the treble does. Great for building tension before a drop.
        </Row>
        <Row term="EQ (HI/MID/LOW)">
          Boost or cut each band. Pulled all the way down, a band is
          effectively silent — that's how you "kill the bass."
        </Row>
        <Row term="Crossfader">
          Blends between the two decks. Centre is 50/50; either edge is that
          deck alone.
        </Row>
      </dl>
    </Sheet>
  )
}

function Row({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <dt className="label !text-[9px] w-20 shrink-0 pt-0.5">{term}</dt>
      <dd className="text-ink-dim leading-relaxed">{children}</dd>
    </div>
  )
}
