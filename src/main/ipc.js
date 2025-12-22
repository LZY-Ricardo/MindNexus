import { ipcMain } from 'electron'
import { randomUUID } from 'node:crypto'

let initialized = false

export function setupIPC() {
  if (initialized) return
  initialized = true

  // A. 窗口管理 (win)
  ipcMain.handle('win:toggle-float', async () => {
    console.log('[ipc] win:toggle-float (not implemented yet)')
  })

  ipcMain.handle('win:set-size', async (_event, payload) => {
    console.log('[ipc] win:set-size (not implemented yet)', payload)
  })

  ipcMain.handle('win:open-main', async () => {
    console.log('[ipc] win:open-main (not implemented yet)')
  })

  // B. 文件系统与导入 (file)
  ipcMain.handle('file:process', async (_event, payload) => {
    console.log('[ipc] file:process (not implemented yet)', payload)
    return { success: true, uuid: randomUUID(), message: 'Not implemented yet' }
  })

  ipcMain.handle('file:list', async (_event, payload) => {
    console.log('[ipc] file:list (not implemented yet)', payload)
    return []
  })

  ipcMain.handle('file:delete', async (_event, payload) => {
    console.log('[ipc] file:delete (not implemented yet)', payload)
    return { success: true, message: 'Not implemented yet' }
  })

  // C. 知识库与 AI (rag)
  ipcMain.handle('rag:search', async (_event, payload) => {
    console.log('[ipc] rag:search (not implemented yet)', payload)
    return []
  })

  ipcMain.handle('rag:chat-start', async (event, payload) => {
    console.log('[ipc] rag:chat-start (not implemented yet)', payload)
    event.sender.send('rag:chat-token', { token: '', done: true })
  })
}
