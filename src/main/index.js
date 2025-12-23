import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { initDatabase } from './database'
import { setupIPC } from './ipc'
import { embedText, initEmbeddings } from './services/embeddings'

function createWindow() {
  // 创建浏览器窗口
  const mainWindow = new BrowserWindow({
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
}

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

  setupIPC()

  // IPC 测试（模板）
  ipcMain.on('ping', () => console.log('pong'))

  createWindow()

  // 预热向量服务：避免首次拖拽导入时长时间等待
  void (async () => {
    try {
      const backend = await initEmbeddings()
      if (backend === 'ollama') await embedText('warmup')
    } catch (error) {
      console.error('[embeddings] warmup failed', error)
    }
  })()

  app.on('activate', function () {
    // 在 macOS 上，当点击 Dock 图标且没有其他窗口打开时
    // 通常会重新创建应用窗口
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// 当所有窗口关闭时退出应用，macOS 除外
// 在 macOS 上，应用及其菜单栏通常保持活动状态
// 直到用户使用 Cmd + Q 显式退出
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// 在此文件中可以包含应用的其他主进程代码
// 也可以将它们放在单独的文件中并在此处引入
