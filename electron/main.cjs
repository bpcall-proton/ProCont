const { app, BrowserWindow, ipcMain, shell } = require('electron')
const fs = require('node:fs/promises')
const path = require('node:path')

function statePath(companyId) {
  if (
    typeof companyId !== 'string' ||
    !/^[a-zA-Z0-9_-]{1,128}$/.test(companyId)
  ) {
    throw new Error('Identificativo azienda non valido')
  }
  return path.join(app.getPath('userData'), `state-${companyId}.json`)
}

ipcMain.handle('local-state:load', async (_event, companyId) => {
  try {
    return await fs.readFile(statePath(companyId), 'utf8')
  } catch (error) {
    if (error && error.code === 'ENOENT') return null
    throw error
  }
})

ipcMain.handle('local-state:save', async (_event, companyId, content) => {
  if (typeof content !== 'string') {
    throw new Error('Contenuto archivio non valido')
  }
  const destination = statePath(companyId)
  const temporary = `${destination}.tmp`
  await fs.mkdir(path.dirname(destination), { recursive: true })
  await fs.writeFile(temporary, content, 'utf8')
  await fs.rename(temporary, destination)
})

function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: '#060810',
    title: 'Fatture & Incassi Pro',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })
  window.webContents.on('will-navigate', (event, url) => {
    const localUrl = new URL(window.webContents.getURL())
    if (new URL(url).origin !== localUrl.origin) {
      event.preventDefault()
      void shell.openExternal(url)
    }
  })

  void window.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
