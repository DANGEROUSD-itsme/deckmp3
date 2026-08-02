import { app, BrowserWindow, Menu } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const isDev = process.env.NODE_ENV === 'development'
const isSingleInstance = app.requestSingleInstanceLock()

if (!isSingleInstance) {
  app.quit()
  process.exit(0)
}

let mainWindow: BrowserWindow | null = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 480,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  const startUrl = isDev
    ? 'http://localhost:5174'
    : `file://${path.join(app.getAppPath(), 'dist', 'index.html')}`
  mainWindow.loadURL(startUrl)

  if (isDev) {
    mainWindow.webContents.openDevTools()
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.webContents.on('context-menu', (e: any) => {
    e.preventDefault()
  })
}

app.on('ready', createWindow)
app.on('activate', () => {
  if (mainWindow === null) {
    createWindow()
  }
})
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// Handle Windows installer first-run (Squirrel)
// Skipped for dev — only needed during production installer setup
