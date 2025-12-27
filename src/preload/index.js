import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// 渲染进程自定义 API
const INVOKE_CHANNELS = [
  'win:toggle-float',
  'win:set-size',
  'win:open-main',
  'win:float-context-menu',
  'file:process',
  'file:open',
  'file:list',
  'file:delete',
  'rag:search',
  'rag:chat-start'
]

const EVENT_CHANNELS = ['rag:chat-token', 'rag:sources', 'file:process-progress']

const api = {
  invoke: (channel, payload) => {
    if (!INVOKE_CHANNELS.includes(channel)) throw new Error(`Invalid IPC channel: ${channel}`)
    return ipcRenderer.invoke(channel, payload)
  },

  toggleFloat: () => ipcRenderer.invoke('win:toggle-float'),
  setSize: (width, height) => ipcRenderer.invoke('win:set-size', { width, height }),
  openMain: () => ipcRenderer.invoke('win:open-main'),

  processFile: (input) => {
    if (typeof input === 'string') return ipcRenderer.invoke('file:process', { filePath: input })
    if (input && typeof input === 'object') return ipcRenderer.invoke('file:process', input)
    throw new Error('processFile 参数无效')
  },
  listFiles: (limit = 50) => ipcRenderer.invoke('file:list', { limit }),
  deleteFile: (uuid) => ipcRenderer.invoke('file:delete', { uuid }),

  search: (query, limit = 5) => ipcRenderer.invoke('rag:search', { query, limit }),
  chatStart: (query, history = [], model = 'llama3') =>
    ipcRenderer.invoke('rag:chat-start', { query, history, model }),

  on: (channel, listener) => {
    if (!EVENT_CHANNELS.includes(channel)) throw new Error(`Invalid IPC event: ${channel}`)
    if (typeof listener !== 'function') throw new Error('Listener must be a function')

    const wrapped = (_event, data) => listener(data)
    ipcRenderer.on(channel, wrapped)
    return () => ipcRenderer.removeListener(channel, wrapped)
  }
}

// 使用 `contextBridge` API 将 Electron API 暴露给渲染进程
// 仅在上下文隔离启用时使用，否则直接添加到 DOM 全局对象
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  window.electron = electronAPI
  window.api = api
}
