const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron')
const fs = require('node:fs/promises')
const path = require('node:path')

app.setAppUserModelId('com.bpcall.fattureincassipro')

function statePath(companyId) {
  if (
    typeof companyId !== 'string' ||
    !/^[a-zA-Z0-9_-]{1,128}$/.test(companyId)
  ) {
    throw new Error('Identificativo azienda non valido')
  }
  return path.join(app.getPath('userData'), `state-${companyId}.json`)
}

function backupDirectoryPath() {
  return path.join(path.dirname(app.getPath('exe')), 'Backup json')
}

function safeBackupName(value) {
  return (
    value
      .normalize('NFKD')
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
      .trim()
      .slice(0, 120) || 'Archivio'
  )
}

function backupLabel(filename, content) {
  if (filename.endsWith('-workspace.json')) return 'Archivio generale'
  try {
    const state = JSON.parse(content)
    const companies = state?.accounting?.companies
    const activeCompanyId = state?.accounting?.activeCompanyId
    const company = Array.isArray(companies)
      ? companies.find((item) => item?.id === activeCompanyId) ?? companies[0]
      : null
    if (typeof company?.name === 'string' && company.name.trim()) {
      return company.name
    }
  } catch {
    return filename.replace(/^state-/, '').replace(/\.json$/, '')
  }
  return filename.replace(/^state-/, '').replace(/\.json$/, '')
}

async function backupLocalStates() {
  const sourceDirectory = app.getPath('userData')
  const backupDirectory = backupDirectoryPath()
  await fs.mkdir(backupDirectory, { recursive: true })
  const sourceFiles = (await fs.readdir(sourceDirectory))
    .filter((filename) => /^state-.+\.json$/.test(filename))
    .sort()
  for (const filename of sourceFiles) {
    const content = await fs.readFile(path.join(sourceDirectory, filename), 'utf8')
    const label = safeBackupName(backupLabel(filename, content))
    let sequence = 1
    let destination = path.join(backupDirectory, `${label} ${sequence}.json`)
    while (true) {
      try {
        await fs.writeFile(destination, content, {
          encoding: 'utf8',
          flag: 'wx',
        })
        await fs.chmod(destination, 0o444)
        break
      } catch (error) {
        if (!error || error.code !== 'EEXIST') throw error
        sequence += 1
        destination = path.join(
          backupDirectory,
          `${label} ${sequence}.json`,
        )
      }
    }
  }
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

ipcMain.handle('local-state:delete', async (_event, companyId) => {
  try {
    await fs.unlink(statePath(companyId))
  } catch (error) {
    if (error && error.code === 'ENOENT') return
    throw error
  }
})

ipcMain.handle(
  'local-state:paths',
  (_event, accountId, activeCompanyId) => ({
    workspace: statePath(`${accountId}-workspace`),
    company: statePath(`company-${activeCompanyId}`),
    backup: backupDirectoryPath(),
  }),
)

ipcMain.handle('local-state:open-backup-directory', async () => {
  const backupDirectory = backupDirectoryPath()
  try {
    await fs.mkdir(backupDirectory, { recursive: true })
    return (await shell.openPath(backupDirectory)) || null
  } catch (error) {
    return error instanceof Error
      ? error.message
      : 'Impossibile aprire la cartella Backup json'
  }
})

ipcMain.handle('drive-backup:select-folder', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory', 'createDirectory'],
    title: 'Seleziona la cartella locale di Google Drive',
  })
  return result.canceled ? null : result.filePaths[0]
})

ipcMain.handle(
  'drive-backup:save',
  async (_event, folderPath, filename, content) => {
    if (typeof folderPath !== 'string' || !path.isAbsolute(folderPath)) {
      throw new Error('Seleziona una cartella locale valida')
    }
    if (
      typeof filename !== 'string' ||
      !/^[a-zA-Z0-9._-]{1,180}\.json$/.test(filename)
    ) {
      throw new Error('Nome backup non valido')
    }
    if (typeof content !== 'string') {
      throw new Error('Contenuto backup non valido')
    }
    const destination = path.join(folderPath, filename)
    const temporary = `${destination}.tmp`
    await fs.mkdir(folderPath, { recursive: true })
    await fs.writeFile(temporary, content, 'utf8')
    await fs.rename(temporary, destination)
    return destination
  },
)

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

app.whenReady().then(async () => {
  try {
    await backupLocalStates()
  } catch (error) {
    console.error('Backup JSON automatico non riuscito', error)
  }
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
