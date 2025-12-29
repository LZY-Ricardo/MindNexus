import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertCircle, RefreshCw, MoreVertical, Send, Sparkles, Code, FileText, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import MessageBubble from '@/components/MessageBubble'
import { toast } from '@/hooks/use-toast'
import { useStore } from '@/lib/store'

// 格式化时间显示 - 简化格式
function formatTime(timestamp) {
  if (!timestamp) return ''
  const date = new Date(timestamp * 1000)
  if (Number.isNaN(date.getTime())) return ''

  const now = new Date()
  const diffMs = now - date
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) {
    // 今天 - 只显示时间
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  } else if (diffDays === 1) {
    // 昨天
    return '昨天'
  } else if (diffDays < 7) {
    // 本周 - 显示星期
    const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
    return weekdays[date.getDay()]
  } else {
    // 更早 - 显示日期
    return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
  }
}

// 快捷指令建议
const quickSuggestions = [
  { icon: <Sparkles className="h-4 w-4" />, text: '分析当前知识库' },
  { icon: <Code className="h-4 w-4" />, text: '帮我写一段代码' },
  { icon: <FileText className="h-4 w-4" />, text: '总结文档内容' }
]

export default function ChatPage() {
  const ollamaModel = useStore((s) => s.ollamaModel)
  const messages = useStore((s) => s.currentChatHistory)
  const setCurrentChatHistory = useStore((s) => s.setCurrentChatHistory)
  const appendChatMessage = useStore((s) => s.appendChatMessage)
  const updateLastAssistantMessage = useStore((s) => s.updateLastAssistantMessage)
  const sessions = useStore((s) => s.sessions)
  const setSessions = useStore((s) => s.setSessions)
  const currentSessionId = useStore((s) => s.currentSessionId)
  const setCurrentSessionId = useStore((s) => s.setCurrentSessionId)
  const currentKbId = useStore((s) => s.currentKbId)
  const setCurrentKbId = useStore((s) => s.setCurrentKbId)
  const ollamaStatus = useStore((s) => s.ollamaStatus)

  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [knowledgeBases, setKnowledgeBases] = useState([])
  const [initialized, setInitialized] = useState(false)

  const checkOllamaStatus = () => useStore.getState().checkOllamaStatus()

  // 页面加载时检测 Ollama 状态
  useEffect(() => {
    if (!initialized) {
      setInitialized(true)
      void checkOllamaStatus()
    }
  }, [initialized])

  const bottomRef = useRef(null)

  const historyForApi = useMemo(
    () =>
      messages
        .filter((m) => m && typeof m === 'object')
        .map((m) => ({ role: String(m.role ?? 'user'), content: String(m.content ?? '') })),
    [messages]
  )

  const loadSessions = useCallback(async () => {
    try {
      const list = await window.api.invoke('session:list')
      // 过滤掉空会话（没有消息的会话）
      const next = Array.isArray(list) ? list.filter((s) => (s.message_count || 0) > 0) : []
      setSessions(next)
      if (!currentSessionId && next.length > 0) {
        setCurrentSessionId(next[0].id)
      }
    } catch (error) {
      toast({ variant: 'destructive', title: '加载会话失败', description: String(error) })
    }
  }, [currentSessionId, setSessions, setCurrentSessionId])

  const loadKnowledgeBases = useCallback(async () => {
    try {
      const list = await window.api.invoke('kb:list')
      setKnowledgeBases(Array.isArray(list) ? list : [])
      const defaultKb = list?.find?.((kb) => kb?.is_default)
      if (defaultKb?.id) setCurrentKbId(defaultKb.id)
    } catch {
      setKnowledgeBases([])
    }
  }, [setCurrentKbId])

  const loadMessages = useCallback(
    async (sessionId) => {
      if (!sessionId) return
      try {
        const list = await window.api.invoke('session:messages', { sessionId })
        const next = Array.isArray(list)
          ? list.map((item) => ({
              id: item.id,
              role: item.role,
              content: item.content,
              sources: item.sources ? JSON.parse(item.sources) : []
            }))
          : []
        setCurrentChatHistory(next)
      } catch (error) {
        toast({ variant: 'destructive', title: '加载消息失败', description: String(error) })
      }
    },
    [setCurrentChatHistory]
  )

  const createSession = useCallback(async () => {
    try {
      const res = await window.api.invoke('session:create', {
        kbId: currentKbId,
        model: ollamaModel
      })
      if (res?.success) {
        await loadSessions()
        setCurrentSessionId(res.session.id)
      }
    } catch (error) {
      toast({ variant: 'destructive', title: '创建会话失败', description: String(error) })
    }
  }, [currentKbId, loadSessions, ollamaModel, setCurrentSessionId])

  const renameSession = async () => {
    const session = sessions.find((s) => s.id === currentSessionId)
    if (!session) return
    const nextTitle = window.prompt('请输入新会话名称', session.title)
    if (!nextTitle) return
    await window.api.invoke('session:update', { id: session.id, title: nextTitle, model: session.model })
    await loadSessions()
  }

  const deleteSession = async () => {
    if (!currentSessionId) return
    const ok = window.confirm('确认删除该会话及其消息？')
    if (!ok) return
    await window.api.invoke('session:delete', { id: currentSessionId })
    setCurrentSessionId(null)
    setCurrentChatHistory([])
    await loadSessions()
  }

  const handleKbChange = useCallback(
    async (value) => {
      const next = String(value ?? '').trim()
      if (!next) return
      setCurrentKbId(next)
      if (!currentSessionId) return
      try {
        await window.api.invoke('session:update', { id: currentSessionId, kbId: next })
        await loadSessions()
      } catch (error) {
        toast({ variant: 'destructive', title: '更新知识库失败', description: String(error) })
      }
    },
    [currentSessionId, loadSessions, setCurrentKbId]
  )

  useEffect(() => {
    void loadSessions()
    void loadKnowledgeBases()
  }, [loadKnowledgeBases, loadSessions])

  useEffect(() => {
    if (sessions.length === 0) {
      void createSession()
    }
  }, [createSession, sessions.length])

  useEffect(() => {
    void loadMessages(currentSessionId)
  }, [currentSessionId, loadMessages])

  useEffect(() => {
    const current = sessions.find((s) => s.id === currentSessionId)
    if (current?.kb_id) {
      setCurrentKbId(current.kb_id)
    }
  }, [currentSessionId, sessions, setCurrentKbId])

  useEffect(() => {
    const off = window.api.on('rag:chat-token', async (data) => {
      const token = String(data?.token ?? '')
      const done = Boolean(data?.done)

      if (token) {
        updateLastAssistantMessage((last) => ({
          ...last,
          content: `${last?.content ?? ''}${token}`
        }))
      }

      if (done) {
        setStreaming(false)
        const last = useStore.getState().currentChatHistory
          .slice()
          .reverse()
          .find((item) => item?.role === 'assistant')
        if (last?.id) {
          await window.api.invoke('session:update-message', {
            id: last.id,
            content: last.content,
            sources: last.sources || []
          })
        }
      }
    })

    return () => off?.()
  }, [updateLastAssistantMessage])

  useEffect(() => {
    const off = window.api.on('rag:sources', async (data) => {
      const sources = Array.isArray(data) ? data : []

      const history = useStore.getState().currentChatHistory
      const last = history[history.length - 1]

      if (last?.role === 'assistant') {
        updateLastAssistantMessage((prev) => ({ ...prev, sources }))
        if (last?.id) {
          await window.api.invoke('session:update-message', {
            id: last.id,
            content: last.content,
            sources
          })
        }
        return
      }

      appendChatMessage({ role: 'assistant', content: '', sources })
    })

    return () => off?.()
  }, [appendChatMessage, updateLastAssistantMessage])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' })
  }, [messages])

  // 生成会话标题
  const generateSessionTitle = useCallback(
    async (firstMessage) => {
      if (!firstMessage || !currentSessionId) return

      try {
        // 通过后端 IPC 调用生成标题
        const title = await window.api.invoke('llm:generate-title', {
          firstMessage,
          model: ollamaModel
        })

        if (title && title !== firstMessage) {
          await window.api.invoke('session:update', { id: currentSessionId, title })
          await loadSessions()
        }
      } catch (error) {
        // 标题生成失败不影响主流程，静默处理
        console.warn('生成标题失败:', error)
      }
    },
    [currentSessionId, ollamaModel, loadSessions]
  )

  const send = async () => {
    const q = input.trim()
    if (!q || streaming || !currentSessionId) return

    setInput('')
    setStreaming(true)

    // 检查是否是当前会话的第一条消息
    const isFirstMessage = messages.length === 0

    try {
      const userRes = await window.api.invoke('session:add-message', {
        sessionId: currentSessionId,
        role: 'user',
        content: q
      })
      appendChatMessage({ id: userRes?.id, role: 'user', content: q })

      const assistantRes = await window.api.invoke('session:add-message', {
        sessionId: currentSessionId,
        role: 'assistant',
        content: ''
      })
      appendChatMessage({ id: assistantRes?.id, role: 'assistant', content: '', sources: [] })

      await window.api.invoke('rag:chat-start', {
        query: q,
        history: historyForApi,
        model: ollamaModel,
        sessionId: currentSessionId,
        kbId: currentKbId
      })

      // 如果是第一条消息，异步生成标题
      if (isFirstMessage) {
        // 延迟执行，避免影响对话响应速度
        setTimeout(() => {
          void generateSessionTitle(q)
        }, 500)
      }
    } catch (error) {
      const msg = String(error?.message || error)
      toast({ variant: 'destructive', title: '发送失败', description: msg })
      updateLastAssistantMessage((last) => ({
        ...last,
        content: `\n[错误] ${msg}\n`
      }))
      setStreaming(false)
    }
  }

  const onKeyDown = (e) => {
    if (e.key === 'Enter') send()
  }

  return (
    <div className="flex h-full">
      {/* 左侧会话列表 - 去盒子感设计 */}
      <div className="flex w-56 shrink-0 flex-col bg-surface-deepest">
        {/* 会话列表头部 */}
        <div className="flex items-center justify-between px-3 py-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            会话
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-cyber hover:bg-cyber-light hover:text-cyber"
            onClick={createSession}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        {/* 会话列表 */}
        <ScrollArea className="min-h-0 flex-1">
          <div className="px-2">
            {sessions.map((session) => (
              <button
                key={session.id}
                type="button"
                className={`group relative my-0.5 w-full rounded-lg px-3 py-2 text-left text-sm transition-all ${
                  session.id === currentSessionId
                    ? 'bg-cyber/10 text-cyber'
                    : 'text-muted-foreground hover:bg-surface-medium'
                }`}
                onClick={() => setCurrentSessionId(session.id)}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium">{session.title}</span>
                  <span className="shrink-0 text-[10px] opacity-60">
                    {formatTime(session.updated_at)}
                  </span>
                </div>
                {(session.message_count || 0) > 0 && (
                  <div className="mt-0.5 truncate text-[10px] opacity-60">
                    {session.message_count} 条消息
                  </div>
                )}
              </button>
            ))}
            {sessions.length === 0 && (
              <div className="py-8 text-center text-xs text-muted-foreground">暂无会话</div>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* 右侧对话区域 */}
      <div className="flex min-w-0 flex-1 flex-col bg-surface-light">
        {/* 头部 - 简化设计 */}
        <div className="flex items-center justify-between border-b px-4 py-2.5">
          <div className="flex items-center gap-3">
            {/* 模型状态指示 */}
            <div className="flex items-center gap-2">
              <span
                className={`h-2 w-2 rounded-full ${
                  ollamaStatus === 'connected' ? 'bg-green-500' : 'bg-orange-500'
                }`}
              />
              <span className="text-sm font-medium">{ollamaModel}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* 知识库选择器 - 胶囊样式 */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1 rounded-full px-3 text-xs font-normal"
                >
                  {knowledgeBases.find((kb) => kb.id === currentKbId)?.name || '默认知识库'}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {knowledgeBases.map((kb) => (
                  <DropdownMenuItem
                    key={kb.id}
                    className="text-xs"
                    onClick={() => void handleKbChange(kb.id)}
                  >
                    {kb.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* 更多操作 */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  className="text-xs"
                  onClick={renameSession}
                  disabled={!currentSessionId}
                >
                  重命名会话
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-xs text-destructive"
                  onClick={deleteSession}
                  disabled={!currentSessionId}
                >
                  删除会话
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Ollama 未连接警告 - 顶部通告栏样式 */}
        {ollamaStatus === 'disconnected' && (
          <div className="flex items-center justify-between gap-3 border-b border-orange-500/20 bg-orange-500/5 px-4 py-2">
            <div className="flex items-center gap-2 text-xs text-orange-600">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              <span>
                Ollama 服务未连接
                <button
                  className="ml-2 underline decoration-orange-500/30 underline-offset-2 hover:decoration-orange-500"
                  onClick={() => void checkOllamaStatus()}
                >
                  点击重试
                </button>
              </span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-orange-600 hover:bg-orange-500/10"
              onClick={() => void checkOllamaStatus()}
            >
              <RefreshCw className="h-3 w-3" />
            </Button>
          </div>
        )}

        {/* 消息区域 */}
        <ScrollArea className="min-h-0 flex-1">
          <div className="px-4 py-4">
            {messages.length === 0 ? (
              /* 空状态 - 带快捷指令 */
              <div className="flex min-h-[60vh] flex-col items-center justify-center">
                <div className="mb-6 text-center">
                  <h3 className="mb-2 text-lg font-semibold">开始新对话</h3>
                  <p className="text-sm text-muted-foreground">选择一个快捷指令或输入你的问题</p>
                </div>
                <div className="flex flex-wrap justify-center gap-2">
                  {quickSuggestions.map((suggestion, idx) => (
                    <button
                      key={idx}
                      className="flex items-center gap-2 rounded-full border px-4 py-2 text-sm text-muted-foreground transition-all hover:border-cyber/50 hover:bg-cyber/5 hover:text-cyber"
                      onClick={() => setInput(suggestion.text)}
                    >
                      {suggestion.icon}
                      <span>{suggestion.text}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <>
                {messages.map((m, idx) => (
                  <MessageBubble
                    key={m?.id || idx}
                    message={m}
                    sources={m?.sources}
                    streaming={streaming}
                    isLast={idx === messages.length - 1}
                  />
                ))}
                <div ref={bottomRef} />
              </>
            )}
          </div>
        </ScrollArea>

        {/* 输入区域 - 悬浮感设计 */}
        <div className="border-t px-4 py-4">
          <div className="mx-auto max-w-3xl">
            <div className="relative flex items-end gap-2 rounded-xl bg-background shadow-lg ring-1 ring-border/50">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="输入你的问题，按 Enter 发送..."
                disabled={streaming}
                className="border-0 bg-transparent px-4 py-3 shadow-none focus-visible:ring-0"
              />
              <Button
                onClick={send}
                disabled={streaming || !input.trim() || !currentSessionId}
                size="icon"
                className="mr-1 mb-1 h-9 w-9 shrink-0 rounded-lg bg-cyber text-cyber-foreground shadow-sm transition-all hover:bg-cyber-hover disabled:opacity-40"
              >
                {streaming ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
            {ollamaStatus === 'connected' && (
              <p className="mt-2 text-center text-[10px] text-muted-foreground">
                由 {ollamaModel} 驱动 · RAG 增强对话
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
