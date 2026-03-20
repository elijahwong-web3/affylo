const { app, BrowserWindow, Menu, dialog } = require('electron')
const { fork } = require('child_process')
const path = require('path')
const fs = require('fs')
const net = require('net')

const PORT = 3456
const isDev = !app.isPackaged
let pendingMenuActions = []

function getResourcePath(...segments) {
  if (isDev) return path.join(__dirname, '..', ...segments)
  return path.join(process.resourcesPath, ...segments)
}

function getUserDataPath(...segments) {
  return path.join(app.getPath('userData'), ...segments)
}

function ensureSeedData() {
  const target = getUserDataPath('data', 'chart.json')
  if (fs.existsSync(target)) return
  fs.mkdirSync(path.dirname(target), { recursive: true })
  const seed = getResourcePath('data', 'chart.json')
  if (fs.existsSync(seed)) {
    fs.copyFileSync(seed, target)
  } else {
    fs.writeFileSync(
      target,
      JSON.stringify({ charts: [], activeChartId: null }, null, 2) + '\n',
      'utf8'
    )
  }
}

function restoreSampleData() {
  const target = getUserDataPath('data', 'chart.json')
  const seed = getResourcePath('data', 'chart.json')
  fs.mkdirSync(path.dirname(target), { recursive: true })
  if (!fs.existsSync(seed)) {
    throw new Error('Bundled sample data file was not found.')
  }
  fs.copyFileSync(seed, target)
}

function waitForPort(port, timeout = 15000) {
  const start = Date.now()
  return new Promise((resolve, reject) => {
    function attempt() {
      const socket = new net.Socket()
      socket.once('connect', () => {
        socket.destroy()
        resolve()
      })
      socket.once('error', () => {
        socket.destroy()
        if (Date.now() - start > timeout) {
          reject(new Error('Server did not start in time'))
        } else {
          setTimeout(attempt, 200)
        }
      })
      socket.connect(port, '127.0.0.1')
    }
    attempt()
  })
}

let serverProcess = null

function startServer() {
  const serverEntry = getResourcePath('.output', 'server', 'index.mjs')

  ensureSeedData()

  const env = {
    ...process.env,
    NITRO_PORT: String(PORT),
    NITRO_HOST: '127.0.0.1',
    NUXT_CHART_DATA_FILE: getUserDataPath('data', 'chart.json'),
    NUXT_PUBLIC_CHART_STORAGE_MODE: 'local',
    NUXT_PUBLIC_APP_PASSWORD: ''
  }

  serverProcess = fork(serverEntry, [], { env, stdio: 'pipe' })

  serverProcess.on('error', (err) => {
    console.error('Server process error:', err)
  })

  serverProcess.on('exit', (code) => {
    console.log('Server exited with code', code)
    serverProcess = null
  })

  return waitForPort(PORT)
}

function killServer() {
  if (serverProcess) {
    serverProcess.kill()
    serverProcess = null
  }
}

let mainWindow = null

function sendMenuAction(action) {
  if (!mainWindow || mainWindow.isDestroyed()) return
  if (mainWindow.webContents.isLoadingMainFrame()) {
    pendingMenuActions.push(action)
    return
  }
  const payload = JSON.stringify(action)
  mainWindow.webContents.executeJavaScript(
    `window.dispatchEvent(new CustomEvent('affylo-menu-action', { detail: ${payload} }));`,
    true
  )
}

function buildAppMenu() {
  const template = [
    {
      label: app.name || 'Affylo',
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide', accelerator: 'CmdOrCtrl+Alt+H' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      role: 'fileMenu',
      submenu: [
        {
          label: 'Export JSON…',
          accelerator: 'CmdOrCtrl+Shift+E',
          click: () => sendMenuAction('export-json')
        },
        {
          label: 'Import JSON…',
          accelerator: 'CmdOrCtrl+Shift+I',
          click: () => sendMenuAction('import-json')
        },
        { type: 'separator' },
        {
          label: 'Factory Restore Affylo…',
          click: async () => {
            if (!mainWindow || mainWindow.isDestroyed()) return
            const result = await dialog.showMessageBox(mainWindow, {
              type: 'warning',
              buttons: ['Cancel', 'Erase and Restore'],
              defaultId: 1,
              cancelId: 0,
              title: 'Factory Restore Affylo',
              message: 'All current charts will be erased.',
              detail: 'Are you sure you want to continue? This action cannot be undone.'
            })
            if (result.response !== 1) return
            try {
              restoreSampleData()
              await dialog.showMessageBox(mainWindow, {
                type: 'info',
                buttons: ['OK'],
                title: 'Factory Restore Complete',
                message: 'Sample chart restored.',
                detail: 'The app will now reload.'
              })
              mainWindow.reload()
            } catch (err) {
              await dialog.showMessageBox(mainWindow, {
                type: 'error',
                buttons: ['OK'],
                title: 'Factory Restore Failed',
                message: err instanceof Error ? err.message : 'Unable to restore sample chart.'
              })
            }
          }
        },
        { type: 'separator' },
        { role: 'close' }
      ]
    },
    {
      role: 'editMenu'
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Center Chart',
          accelerator: 'CmdOrCtrl+H',
          click: () => sendMenuAction('center-chart')
        },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      role: 'windowMenu'
    }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    title: 'Affylo',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  })

  mainWindow.loadURL(`http://127.0.0.1:${PORT}`)
  mainWindow.webContents.on('did-finish-load', () => {
    if (!pendingMenuActions.length) return
    const toDispatch = [...pendingMenuActions]
    pendingMenuActions = []
    for (const action of toDispatch) sendMenuAction(action)
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(async () => {
  try {
    await startServer()
    createWindow()
    buildAppMenu()
  } catch (err) {
    console.error('Failed to start:', err)
    app.quit()
  }
})

app.on('window-all-closed', () => {
  killServer()
  app.quit()
})

app.on('before-quit', () => {
  killServer()
})

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow()
  }
})
