# DECK

A local-first MP3 player for the browser, styled after a hi-fi faceplate.

Point it at a folder of MP3s. It reads tags and artwork once, then plays
entirely on your own machine — nothing is uploaded, nothing is streamed, and
it keeps working with the network unplugged. It installs as a PWA, and there
is an Electron build for a real desktop app (see [ELECTRON.md](ELECTRON.md)).

**Current version: 2.01 “Faceplate”.**

## Features

**Playback**
- Gapless crossfade between tracks on twin decks, with a configurable overlap
  that hides MP3 encoder padding.
- Ten-band graphic equalizer (shelf / peak / shelf) with a preamp trim and
  twelve presets, built as a permanent pass-through chain so toggling it can
  never drop audio mid-track.
- Night mode compressor, stereo balance, and playback speed with pitch
  preserved.
- A↔B loop markers, a sleep timer (fixed minutes or end-of-track), shuffle,
  and three repeat modes.
- Smooth pause: the master gain ramps rather than cutting.
- OS media keys, lock-screen artwork and scrubbing via the Media Session API.

**Library**
- Browse by album grid, track list, artist or genre.
- Smart views: recently added, favourites, most played, recently played, top
  rated, never played.
- Favourites, five-star ratings and play counts, banked once you have stayed
  with a track past a threshold you set.
- Playlists with drag-to-reorder, filtering and duplication.
- Search that falls back to fuzzy matching when a substring finds nothing.
- Import by folder picker or by dropping files anywhere on the window.

**Interface**
- Command palette on ⌘K / Ctrl+K over every track and every command.
- Editable queue: play next, add to queue, reorder, remove, save as playlist.
- Right-click or long-press any track for a full context menu.
- Four visualizer modes — a 3D instanced ring, an orbiting particle cloud, a
  log-band analyser and an oscilloscope — plus a transport spectrum strip and
  VU meters.
- Now Playing tints itself with a colour sampled from the current cover.
- Light and dark themes (or follow the system), six accent colours, and a
  density switch.
- Full keyboard control; press `?` for the list.

## Storage

DECK uses the File System Access API where it exists, holding a permission to
read your music folder and streaming straight off disk — only tags and artwork
are cached. Browsers without that API (Firefox, Safari) fall back to copying
each track into local storage on import, which is what lets those browsers
launch straight into the library instead of asking for the folder again.

Listening history lives in its own store, so a rescan never clobbers your play
counts and clearing the library deliberately keeps them.

## Development

```sh
npm install
npm run dev        # vite dev server
npm run build      # typecheck electron + production bundle
npm run lint       # oxlint
npm run electron-dev    # run the desktop shell against the dev build
npm run electron-build  # package a desktop installer
```

---

Developed by [studiosdpe.com](https://studiosdpe.com).
