import { app, shell, BrowserWindow, ipcMain, Menu, Tray, nativeImage } from 'electron'
import { join } from 'path'
import { existsSync } from 'node:fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { initDatabase } from './database'
import { setupIPC } from './ipc'
import { embedText, initEmbeddings } from './services/embeddings'

let tray = null
let mainWindow = null
let floatWindow = null
let isQuitting = false

function getTrayIcon() {
  const resourcesIconPath = join(__dirname, '../../resources/icon.png')
  if (existsSync(resourcesIconPath)) return nativeImage.createFromPath(resourcesIconPath)

  if (typeof icon === 'string' && existsSync(icon)) return nativeImage.createFromPath(icon)

  console.warn('[tray] icon not found:', resourcesIconPath)
  return nativeImage.createEmpty()
}

function createWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) return mainWindow

  mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault()
      mainWindow.hide()
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // 基于 electron-vite CLI 的渲染进程热模块替换 (HMR)
  // 开发环境加载远程 URL，生产环境加载本地 HTML 文件
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}

function showMainWindow() {
  const win = createWindow()
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}

function createFloatWindow() {
  if (floatWindow && !floatWindow.isDestroyed()) return floatWindow

  floatWindow = new BrowserWindow({
    width: 680,
    height: 60,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  floatWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault()
      floatWindow.hide()
    }
  })

  floatWindow.on('closed', () => {
    floatWindow = null
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    floatWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#/float`)
  } else {
    floatWindow.loadFile(join(__dirname, '../renderer/index.html'), { hash: '/float' })
  }

  return floatWindow
}

function openFloatWindow() {
  const win = createFloatWindow()
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}

function toggleFloatWindow() {
  const win = createFloatWindow()
  if (win.isVisible()) {
    win.hide()
    return
  }
  openFloatWindow()
}

function setFloatWindowSize(width, height) {
  const w = Number(width)
  const h = Number(height)
  if (!Number.isFinite(w) || !Number.isFinite(h)) return

  const win = createFloatWindow()
  win.setSize(Math.max(200, Math.round(w)), Math.max(40, Math.round(h)), true)
}

function createTray() {
  if (tray) return tray

  tray = new Tray(getTrayIcon())
  tray.setToolTip('MindNexus')

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '打开仪表盘 (Dashboard)',
      click: () => showMainWindow()
    },
    {
      label: '打开悬浮搜索 (Search Bar)',
      click: () => openFloatWindow()
    },
    { type: 'separator' },
    {
      label: '退出 (Quit)',
      click: () => {
        isQuitting = true
        app.quit()
      }
    }
  ])

  tray.setContextMenu(contextMenu)

  tray.on('click', () => {
    const win = createWindow()
    if (!win.isVisible()) {
      showMainWindow()
      return
    }

    if (win.isFocused()) {
      win.minimize()
      return
    }

    showMainWindow()
  })

  tray.on('right-click', () => {
    tray.popUpContextMenu(contextMenu)
  })

  return tray
}

app.on('before-quit', () => {
  isQuitting = true
})

const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    showMainWindow()
  })

  // 当 Electron 完成初始化并准备好创建浏览器窗口时调用此方法
  // 某些 API 只能在此事件发生后使用
  app.whenReady().then(async () => {
    // 设置 Windows 平台的应用用户模型 ID
    electronApp.setAppUserModelId('com.electron')

    // 开发环境下按 F12 打开/关闭开发者工具
    // 生产环境下忽略 CommandOrControl + R 快捷键
    // 详见 https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })

    try {
      await initDatabase()
    } catch (error) {
      console.error('[db] init failed', error)
    }

    setupIPC({
      toggleFloatWindow,
      setFloatWindowSize,
      showMainWindow
    })

    // IPC 测试（模板）
    ipcMain.on('ping', () => console.log('pong'))

    createWindow()
    createTray()

    // 预热向量服务：避免首次拖拽导入时长时间等待
    void (async () => {
      try {
        const backend = await initEmbeddings()
        if (backend === 'ollama') await embedText('warmup')
      } catch (error) {
        console.error('[embeddings] warmup failed', error)
      }
    })()

    app.on('activate', () => {
      showMainWindow()
    })
  })
}

// 当所有窗口关闭时退出应用，macOS 除外
// 在 macOS 上，应用及其菜单栏通常保持活动状态
// 直到用户使用 Cmd + Q 显式退出
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
