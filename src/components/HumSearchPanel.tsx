import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ANALYSIS_SAMPLE_RATE,
  ensureLibraryAnalyzed,
  decodeHumBlob,
  searchHum,
  type AnalyzeProgress,
  type HumMatch,
} from '../lib/hum'
import { useDeck } from '../store/deck'
import { Cover } from './Cover'
import { MicIcon } from './icons'
import { Sheet } from './ui'

const MAX_RECORD_MS = 8000
const MIN_RECORD_MS = 1500

type Phase = 'preparing' | 'idle' | 'recording' | 'searching' | 'results'

/**
 * Hum to Find: hum or sing a few seconds into the mic, match it against the
 * library's own melody fingerprints. Everything happens locally — no
 * network call, nothing leaves the browser. See lib/hum.ts for how the
 * matching actually works (and its real limits: it's tracking whatever's
 * melodically dominant in a polyphonic mix, so this works best on
 * vocal-forward tracks and clear, short hums).
 */
export function HumSearchPanel() {
  const { closePanel, tracks, resolveFile, byId, playNow, toast } = useDeck()
  const [phase, setPhase] = useState<Phase>('preparing')
  const [progress, setProgress] = useState<AnalyzeProgress>({ done: 0, total: 0 })
  const [elapsedMs, setElapsedMs] = useState(0)
  const [matches, setMatches] = useState<HumMatch[]>([])

  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const cancelledRef = useRef(false)
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // `recorder.onstop` is wired up once per recording, inside `startRecording`
  // — its closure over `handleStop` (and anything that closure reads from
  // React state) is fixed at that moment, not live. Reading elapsed time
  // from a ref instead of the `elapsedMs` state sidesteps that: a ref read
  // always sees the current value no matter how stale the closure around it
  // is, where reading `elapsedMs` directly was silently always seeing 0.
  const recordStartRef = useRef(0)

  // Analyze the library once (cached after) before recording is allowed —
  // otherwise a hum could land with nothing to match against yet, which
  // just reads as "didn't work" rather than "still getting ready".
  useEffect(() => {
    cancelledRef.current = false
    void ensureLibraryAnalyzed(
      tracks,
      resolveFile,
      (p) => setProgress(p),
      () => cancelledRef.current
    ).then(() => {
      if (!cancelledRef.current) setPhase('idle')
    })
    return () => {
      cancelledRef.current = true
    }
    // Only re-run if the track list identity actually changes, not on every
    // render — this kicks off a real (if cheap) background analysis pass.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracks])

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    if (stopTimerRef.current) clearTimeout(stopTimerRef.current)
    if (tickRef.current) clearInterval(tickRef.current)
    stopTimerRef.current = null
    tickRef.current = null
  }, [])

  useEffect(() => stopStream, [stopStream])

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      chunksRef.current = []
      const recorder = new MediaRecorder(stream)
      recorderRef.current = recorder
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorder.onstop = () => {
        void handleStop()
      }
      recorder.start()
      setPhase('recording')
      setElapsedMs(0)
      recordStartRef.current = performance.now()
      tickRef.current = setInterval(
        () => setElapsedMs(performance.now() - recordStartRef.current),
        100
      )
      stopTimerRef.current = setTimeout(() => stopRecording(), MAX_RECORD_MS)
    } catch {
      toast('Microphone access was denied or unavailable', 'error')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast])

  const stopRecording = useCallback(() => {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
    stopStream()
  }, [stopStream])

  const handleStop = useCallback(async () => {
    const blob = new Blob(chunksRef.current, { type: recorderRef.current?.mimeType })
    chunksRef.current = []
    const actualElapsedMs = performance.now() - recordStartRef.current
    if (actualElapsedMs < MIN_RECORD_MS) {
      toast('Too short — hum for a couple of seconds at least', 'error')
      setPhase('idle')
      return
    }
    setPhase('searching')
    const mono = await decodeHumBlob(blob)
    if (!mono) {
      toast("Couldn't process that recording", 'error')
      setPhase('idle')
      return
    }
    const results = await searchHum(mono, ANALYSIS_SAMPLE_RATE)
    setMatches(results.slice(0, 5))
    setPhase('results')
  }, [toast])

  const play = (trackId: string) => {
    void playNow(trackId, [trackId])
    closePanel()
  }

  return (
    <Sheet
      title="Hum to Find"
      subtitle="Hum or sing a few seconds — matched against your own library, nothing leaves your browser"
      icon={<MicIcon className="w-[18px] h-[18px]" />}
      onClose={closePanel}
      width="sm:max-w-md"
    >
      <div className="flex flex-col items-center text-center gap-6 py-4">
        {phase === 'preparing' && (
          <>
            <p className="label normal-case tracking-normal text-ink-dim">
              Getting your library ready to match against
              {progress.total > 0 ? ` — ${progress.done}/${progress.total}` : '…'}
            </p>
            <div className="w-full max-w-xs h-1.5 rounded-full bg-surface overflow-hidden">
              <div
                className="h-full bg-signal transition-[width] duration-300"
                style={{
                  width:
                    progress.total > 0
                      ? `${Math.round((progress.done / progress.total) * 100)}%`
                      : '8%',
                }}
              />
            </div>
          </>
        )}

        {phase === 'idle' && (
          <>
            <button
              onClick={() => void startRecording()}
              className="w-20 h-20 rounded-full bg-signal/15 text-signal grid place-items-center hover:bg-signal/25 transition-colors"
              aria-label="Start humming"
            >
              <MicIcon className="w-8 h-8" />
            </button>
            <p className="label normal-case tracking-normal text-ink-faint max-w-xs">
              Tap, then hum or sing the melody for a few seconds
            </p>
          </>
        )}

        {phase === 'recording' && (
          <>
            <button
              onClick={stopRecording}
              className="w-20 h-20 rounded-full bg-signal text-panel-deep grid place-items-center animate-pulse"
              aria-label="Stop"
            >
              <div className="w-5 h-5 rounded-sm bg-panel-deep" />
            </button>
            <p className="label normal-case tracking-normal text-ink-dim">
              Listening — {(elapsedMs / 1000).toFixed(1)}s. Tap to stop.
            </p>
          </>
        )}

        {phase === 'searching' && (
          <p className="label normal-case tracking-normal text-ink-dim">Matching…</p>
        )}

        {phase === 'results' && (
          <div className="w-full">
            {matches.length === 0 ? (
              <>
                <p className="label normal-case tracking-normal text-ink-faint">
                  No confident match in your library.
                </p>
                <button onClick={() => setPhase('idle')} className="ghost-btn mt-4">
                  Try again
                </button>
              </>
            ) : (
              <>
                <div className="flex flex-col gap-2">
                  {matches.map((m) => {
                    const track = byId.get(m.trackId)
                    if (!track) return null
                    return (
                      <button
                        key={m.trackId}
                        onClick={() => play(m.trackId)}
                        className="flex items-center gap-3 p-2 rounded-lg hover:bg-surface transition-colors text-left"
                      >
                        <Cover
                          artKey={track.artKey}
                          title={track.title}
                          className="w-11 h-11 shrink-0"
                          rounded="rounded-md"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{track.title}</p>
                          <p className="label !text-[10px] normal-case tracking-normal text-ink-faint truncate">
                            {track.artist}
                          </p>
                        </div>
                      </button>
                    )
                  })}
                </div>
                <button onClick={() => setPhase('idle')} className="ghost-btn mt-4">
                  Try again
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </Sheet>
  )
}
