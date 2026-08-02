# DECK — Electron Desktop App

This directory contains the Electron wrapper for DECK, allowing it to run as a native Windows desktop application.

## Building

### Development (with hot reload)
```bash
npm run electron-dev
```

This starts the Vite dev server on `:5174` and launches Electron pointing to it. Any changes to the React app or Electron main process will auto-reload.

### Production Installer
```bash
npm run electron-build
```

This:
1. Compiles Electron TypeScript files to `dist-electron/`
2. Builds the Vite app to `dist/`
3. Runs electron-builder to create a Windows installer (`.exe`)
4. Outputs to `release/` folder

The installer creates Start Menu shortcut and can optionally add a desktop shortcut.

## File Structure

- `electron/main.ts` — Electron main process (app lifecycle, window management)
- `electron/preload.ts` — Security preload script (currently minimal)
- `tsconfig.electron.json` — TypeScript config for Electron files (keeps renderer config clean)
- `dist-electron/` — Compiled Electron files (created during build)
- `release/` — Built `.exe` installer (created during electron-build)

## Auto-start on Windows

The installer uses NSIS (Nullsoft Scriptable Install System) to create a standard Windows installer.
To add auto-start at login, you can:

1. Manually: Settings → Startup Apps → toggle DECK
2. Or add a registry entry in `main.ts` (optional, depends on user preferences)

## Notes

- The app loads from `file://` URLs in production (bundled)
- In dev mode, it points to the Vite dev server
- Service worker is active both ways, so offline-first works seamlessly
- All user data (IndexedDB, cached covers, playlists) persists across app restarts
