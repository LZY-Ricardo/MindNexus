import { create } from 'zustand'

function getInitialOllamaModel() {
  try {
    const saved = typeof localStorage !== 'undefined' ? localStorage.getItem('ollamaModel') : null
    if (saved && saved.trim()) return saved.trim()
  } catch {
    // 忽略 localStorage 读失败
  }
  return 'qwen3:8b'
}

const DEFAULT_CONFIG = {
  ollamaUrl: 'http://localhost:11434',
  ollamaModel: getInitialOllamaModel(),
  embeddingsBackend: 'ollama',
  embeddingsModel: 'nomic-embed-text:latest',
  defaultSearchMode: 'hybrid',
  sessionHistoryLimit: 50,
  autoBackup: false,
  autoBackupInterval: 86400,
  autoBackupCount: 7
}

export const useStore = create((set) => ({
  sidebarOpen: true,
  setSidebarOpen: (open) => set({ sidebarOpen: Boolean(open) }),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),

  // Ollama 模型名（例如：qwen3:8b、llama3）
  ollamaModel: getInitialOllamaModel(),
  config: { ...DEFAULT_CONFIG },
  loadConfig: async () => {
    try {
      const cfg = await window.api?.invoke?.('settings:get')
      const next = { ...DEFAULT_CONFIG, ...(cfg || {}) }
      set({ config: next, ollamaModel: next.ollamaModel || DEFAULT_CONFIG.ollamaModel })
    } catch {
      // 忽略配置加载失败
    }
  },
  saveConfig: async (partial) => {
    const res = await window.api?.invoke?.('settings:set', partial)
    const next = { ...DEFAULT_CONFIG, ...(res?.config || {}) }
    set({ config: next, ollamaModel: next.ollamaModel || DEFAULT_CONFIG.ollamaModel })
    try {
      localStorage.setItem('ollamaModel', next.ollamaModel)
    } catch {
      // 忽略 localStorage 写失败
    }
    return next
  },
  setOllamaModel: (model) =>
    set(() => {
      const next = String(model ?? '').trim() || 'qwen3:8b'
      try {
        localStorage.setItem('ollamaModel', next)
      } catch {
        // 忽略 localStorage 写失败
      }
      return { ollamaModel: next, config: { ...DEFAULT_CONFIG, ollamaModel: next } }
    }),

  currentSessionId: null,
  setCurrentSessionId: (id) => set({ currentSessionId: id || null }),
  sessions: [],
  setSessions: (sessions) => set({ sessions: Array.isArray(sessions) ? sessions : [] }),
  currentKbId: 'default',
  setCurrentKbId: (id) => set({ currentKbId: id || 'default' }),

  // 用于跨页面保留当前会话（role/content 形状兼容后端 history）
  currentChatHistory: [],
  setCurrentChatHistory: (messages) =>
    set({ currentChatHistory: Array.isArray(messages) ? messages : [] }),
  appendChatMessage: (message) =>
    set((state) => ({
      currentChatHistory: [...state.currentChatHistory, message]
    })),
  updateLastAssistantMessage: (updater) =>
    set((state) => {
      const history = state.currentChatHistory
      if (!history.length) return { currentChatHistory: history }

      const lastIndex = history.length - 1
      const last = history[lastIndex]
      if (last?.role !== 'assistant') return { currentChatHistory: history }

      const next = typeof updater === 'function' ? updater(last) : last
      const newHistory = history.slice()
      newHistory[lastIndex] = next
      return { currentChatHistory: newHistory }
    })
}))
