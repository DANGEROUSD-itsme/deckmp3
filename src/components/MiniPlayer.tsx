import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useDeck, usePosition } from '../store/deck'
import { Cover } from './Cover'
import { NextIcon, PauseIcon, PipIcon, PlayIcon, PrevIcon } from './icons'

/**
 * Document Picture-in-Picture: a genuinely separate always-on-top window
 * that survives switching away from the tab/app, distinct from the older
 * video-only `requestPictureInPicture()`. Chromium-only as of writing
 * (Chrome/Edge 116+) — `supportsPip` gates the whole feature so it simply
 * doesn't appear elsewhere.
 */
declare global {
  interface Window {
    documentPictureInPicture?: {
      requestWindow: (options?: { width?: number; height?: number }) => Promise<Window>
      window: Window | null
    }
  }
}

export const supportsPip =
  typeof window !== 'undefined' && 'documentPictureInPicture' in window

const WIDTH = 320
const HEIGHT = 128

/**
 * A PiP window is a real, separate `Document` — none of the app's CSS or
 * `<html>` theme attributes exist there until copied over. Serializing each
 * loaded stylesheet's rules into a fresh <style> tag works uniformly for
 * both the dev server's inline `<style>` injection and the built app's
 * bundled `<link>` (same-origin either way, so `cssRules` never throws),
 * and mirroring `.dark` / `data-accent` / `data-density` off `<html>` is
 * what lets `--signal` and friends resolve to the same values there.
 */
function mirrorStyles(pipDoc: Document) {
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const rules = Array.from(sheet.cssRules)
        .map((r) => r.cssText)
        .join('\n')
      const style = pipDoc.createElement('style')
      style.textContent = rules
      pipDoc.head.appendChild(style)
    } catch {
      // Cross-origin stylesheet — shouldn't happen for the app's own CSS.
    }
  }
}

function mirrorTheme(pipDoc: Document) {
  const src = document.documentElement
  const dst = pipDoc.documentElement
  dst.classList.toggle('dark', src.classList.contains('dark'))
  dst.dataset.accent = src.dataset.accent
  dst.dataset.density = src.dataset.density
}

function MiniPlayerContent() {
  const { current, isPlaying, toggle, next, prev } = useDeck()
  const { position, duration } = usePosition()
  const pct = duration > 0 ? Math.min(100, (position / duration) * 100) : 0

  if (!current) {
    return (
      <div className="h-screen grid place-items-center bg-panel-deep">
        <p className="label normal-case tracking-normal text-ink-faint">Nothing playing</p>
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col bg-panel-deep text-ink select-none overflow-hidden">
      <div className="flex-1 min-h-0 flex items-center gap-3 px-3">
        <div className="w-16 h-16 shrink-0 rounded-md overflow-hidden well">
          <Cover
            artKey={current.artKey}
            title={current.title}
            className="w-full h-full"
            rounded="rounded-md"
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium truncate">{current.title}</p>
          <p className="label !text-[10px] normal-case tracking-normal text-ink-faint truncate mt-0.5">
            {current.artist}
          </p>
          <div className="flex items-center gap-1.5 mt-2.5">
            <button
              onClick={() => void prev()}
              className="control-btn w-8 h-8"
              aria-label="Previous"
            >
              <PrevIcon className="w-4 h-4" />
            </button>
            <button
              onClick={() => void toggle()}
              className="control-btn-main w-9 h-9"
              aria-label={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? <PauseIcon className="w-4 h-4" /> : <PlayIcon className="w-4 h-4" />}
            </button>
            <button onClick={() => void next()} className="control-btn w-8 h-8" aria-label="Next">
              <NextIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
      <div className="h-[3px] bg-surface shrink-0">
        <div className="h-full bg-signal" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

/**
 * The toggle button plus the portal that actually populates the bubble.
 * Rendering `<MiniPlayerContent />` via `createPortal` into the PiP
 * window's own `document.body` keeps it a normal part of this component's
 * React tree — `useDeck()` and click handlers work there exactly as they
 * would anywhere else in the app, with no message-passing between windows
 * needed, since a Document PiP window is same-origin and React portals
 * route events through the React tree rather than the DOM tree.
 */
export function PictureInPictureButton() {
  const [pipWindow, setPipWindow] = useState<Window | null>(null)
  const { current, theme, settings } = useDeck()

  // Keep the mirrored theme attributes live — switching theme/accent/density
  // in the main window shouldn't require closing and reopening the bubble.
  useEffect(() => {
    if (pipWindow) mirrorTheme(pipWindow.document)
  }, [pipWindow, theme, settings.accent, settings.density])

  // Keep the bubble's own window title in sync with the track playing.
  useEffect(() => {
    if (pipWindow) pipWindow.document.title = current?.title ?? 'DECK'
  }, [pipWindow, current?.title])

  if (!supportsPip) return null

  const open = async () => {
    if (pipWindow) return
    const win = await window.documentPictureInPicture!.requestWindow({
      width: WIDTH,
      height: HEIGHT,
    })
    mirrorStyles(win.document)
    mirrorTheme(win.document)
    win.document.body.style.margin = '0'
    win.addEventListener('pagehide', () => setPipWindow(null), { once: true })
    setPipWindow(win)
  }

  const close = () => pipWindow?.close()

  return (
    <>
      <button
        onClick={() => (pipWindow ? close() : void open())}
        className={`control-btn w-9 h-9 ${pipWindow ? 'control-btn-on' : ''}`}
        aria-label="Mini player"
        title="Pop out a mini player"
      >
        <PipIcon className="w-4 h-4" />
      </button>
      {pipWindow && createPortal(<MiniPlayerContent />, pipWindow.document.body)}
    </>
  )
}
