import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { AlertCircle, RefreshCw, MoreVertical, Send, Sparkles, Code, FileText, Plus, X, BookOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Dialog, DialogPortal, DialogOverlay, DialogClose } from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import MessageBubble from '@/components/MessageBubble'
import { toast } from '@/hooks/use-toast'
import { useStore } from '@/lib/store'
import { cn } from '@/lib/utils'

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
  const openSessionIds = useStore((s) => s.openSessionIds)
  const setOpenSessionIds = useStore((s) => s.setOpenSessionIds)
  const currentKbId = useStore((s) => s.currentKbId)
  const setCurrentKbId = useStore((s) => s.setCurrentKbId)
  const ollamaStatus = useStore((s) => s.ollamaStatus)

  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [knowledgeBases, setKnowledgeBases] = useState([])
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyQuery, setHistoryQuery] = useState('')
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

  const currentSession = useMemo(
    () => sessions.find((s) => s.id === currentSessionId) || null,
    [currentSessionId, sessions]
  )

  const activeModel = currentSession?.model || ollamaModel

  const loadSessions = useCallback(async () => {
    try {
      const list = await window.api.invoke('session:list')
      // 保留空会话：用于 Tab 体验（新建会话在发送第一条消息前 message_count 可能为 0）
      const next = Array.isArray(list) ? list : []
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
    if (currentSession?.kb_id) {
      setCurrentKbId(currentSession.kb_id)
    }
  }, [currentSession, setCurrentKbId])

  useEffect(() => {
    const existing = new Set(sessions.map((s) => s.id))
    const next = openSessionIds.filter((id) => existing.has(id))
    if (currentSessionId && !next.includes(currentSessionId)) {
      next.push(currentSessionId)
    }
    if (next.length !== openSessionIds.length) {
      setOpenSessionIds(next)
    }
  }, [currentSessionId, openSessionIds, sessions, setOpenSessionIds])

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
           model: activeModel
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
    [currentSessionId, activeModel, loadSessions]
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
        model: activeModel,
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

  const tabs = useMemo(() => {
    const map = new Map(sessions.map((s) => [s.id, s]))
    return openSessionIds.map((id) => map.get(id)).filter(Boolean)
  }, [openSessionIds, sessions])

  const openFromHistory = useCallback(
    (sessionId) => {
      const id = String(sessionId ?? '').trim()
      if (!id) return
      if (!openSessionIds.includes(id)) {
        setOpenSessionIds([...openSessionIds, id])
      }
      setCurrentSessionId(id)
      setHistoryOpen(false)
    },
    [openSessionIds, setCurrentSessionId, setHistoryOpen, setOpenSessionIds]
  )

  const closeTab = useCallback(
    (e, sessionId) => {
      e.preventDefault()
      e.stopPropagation()
      const id = String(sessionId ?? '').trim()
      if (!id) return

      const nextOpen = openSessionIds.filter((sid) => sid !== id)
      setOpenSessionIds(nextOpen)

      if (currentSessionId === id) {
        const nextActive = nextOpen[nextOpen.length - 1]
        if (nextActive) {
          setCurrentSessionId(nextActive)
        } else {
          void createSession()
        }
      }
    },
    [createSession, currentSessionId, openSessionIds, setCurrentSessionId, setOpenSessionIds]
  )

  const historyGroups = useMemo(() => {
    const q = historyQuery.trim().toLowerCase()
    const now = new Date()

    const candidates = sessions
      .filter((s) => (s.message_count || 0) > 0)
      .filter((s) => (q ? String(s.title ?? '').toLowerCase().includes(q) : true))

    const groups = {
      today: [],
      yesterday: [],
      week: [],
      older: []
    }

    for (const session of candidates) {
      const ts = Number(session?.updated_at || session?.created_at || 0)
      const date = ts ? new Date(ts * 1000) : null
      const diffDays = date ? Math.floor((now - date) / (1000 * 60 * 60 * 24)) : 999

      if (diffDays === 0) groups.today.push(session)
      else if (diffDays === 1) groups.yesterday.push(session)
      else if (diffDays < 7) groups.week.push(session)
      else groups.older.push(session)
    }

    return [
      { title: '今天', items: groups.today },
      { title: '昨天', items: groups.yesterday },
      { title: '7 天内', items: groups.week },
      { title: '更早', items: groups.older }
    ].filter((g) => g.items.length > 0)
  }, [historyQuery, sessions])

  return (
    <div className="flex h-full min-w-0 flex-col bg-background">
      {/* 顶部 Tab 栏（浏览器式体验） */}
      <div className="flex h-11 items-end border-b bg-card/40">
        <div className="flex items-center px-2 pb-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setHistoryOpen(true)}
            aria-label="打开历史记录"
          >
            <BookOpen className="h-4 w-4" />
          </Button>
        </div>

        <div className="min-w-0 flex-1 overflow-x-auto px-1 pb-1">
          <div className="flex min-w-max items-end gap-1">
            {tabs.map((session) => {
              const active = session.id === currentSessionId
              return (
                <div
                  key={session.id}
                  role="button"
                  tabIndex={0}
                  className={cn(
                    'group relative flex h-9 max-w-[220px] cursor-pointer items-center gap-2 rounded-t-md px-3 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    active ? 'bg-background text-foreground' : 'bg-muted/30 text-muted-foreground hover:bg-muted/50'
                  )}
                  onClick={() => setCurrentSessionId(session.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      setCurrentSessionId(session.id)
                    }
                  }}
                >
                  {active && (
                    <span className="absolute inset-x-2 top-0 h-[2px] rounded-full bg-primary" />
                  )}
                  <span className="truncate">{session.title || '未命名会话'}</span>
                  <button
                    type="button"
                    className={cn(
                      'ml-1 inline-flex h-5 w-5 items-center justify-center rounded-sm text-muted-foreground/70 transition-opacity hover:bg-muted hover:text-foreground',
                      active ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                    )}
                    onClick={(e) => closeTab(e, session.id)}
                    aria-label="关闭标签页"
                    title="关闭"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )
            })}
          </div>
        </div>

        <div className="flex items-center px-2 pb-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={createSession}
            aria-label="新建会话"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* 二级工具栏（当前会话设置） */}
      <div className="flex items-center justify-between border-b px-4 py-2">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'h-2 w-2 rounded-full',
                ollamaStatus === 'connected' ? 'bg-green-500' : 'bg-orange-500'
              )}
            />
            <span className="text-sm font-medium">{activeModel}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 gap-1 rounded-full px-3 text-xs font-normal">
                {knowledgeBases.find((kb) => kb.id === currentKbId)?.name || '默认知识库'}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {knowledgeBases.map((kb) => (
                <DropdownMenuItem key={kb.id} className="text-xs" onClick={() => void handleKbChange(kb.id)}>
                  {kb.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem className="text-xs" onClick={renameSession} disabled={!currentSessionId}>
                重命名会话
              </DropdownMenuItem>
              <DropdownMenuItem className="text-xs text-destructive" onClick={deleteSession} disabled={!currentSessionId}>
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

      {/* 消息区域（全宽容器 + 居中内容，控制行宽） */}
      <ScrollArea className="min-h-0 flex-1">
        <div className="mx-auto w-full max-w-4xl px-4 py-4">
          {messages.length === 0 ? (
            <div className="flex min-h-[60vh] flex-col items-center justify-center">
              <div className="mb-6 text-center">
                <h3 className="mb-2 text-lg font-semibold">开始新对话</h3>
                <p className="text-sm text-muted-foreground">选择一个快捷指令或输入你的问题</p>
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                {quickSuggestions.map((suggestion, idx) => (
                  <button
                    key={idx}
                    className="flex items-center gap-2 rounded-full border px-4 py-2 text-sm text-muted-foreground transition-all hover:border-primary/50 hover:bg-primary/5 hover:text-primary"
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

      {/* 输入区域 */}
      <div className="border-t px-4 py-4">
        <div className="mx-auto w-full max-w-4xl">
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
              className="mr-1 mb-1 h-9 w-9 shrink-0 rounded-lg bg-primary text-primary-foreground shadow-sm transition-all hover:bg-primary/90 disabled:opacity-40"
            >
              {streaming ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
          {ollamaStatus === 'connected' && (
            <p className="mt-2 text-center text-[10px] text-muted-foreground">
              由 {activeModel} 驱动 · RAG 增强对话
            </p>
          )}
        </div>
      </div>

      {/* 历史记录抽屉 */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogPortal>
          <DialogOverlay className="bg-black/50" />
          <DialogPrimitive.Content
            className={cn(
              'fixed inset-y-0 left-0 z-50 w-[360px] max-w-[90vw] border-r bg-background shadow-xl outline-none',
              'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
              'data-[state=open]:slide-in-from-left-full data-[state=closed]:slide-out-to-left-full'
            )}
          >
            <div className="flex h-full flex-col">
              <div className="flex items-center gap-2 border-b px-4 py-3">
                <Input
                  value={historyQuery}
                  onChange={(e) => setHistoryQuery(e.target.value)}
                  placeholder="搜索历史会话..."
                  className="h-9"
                />
                <DialogClose asChild>
                  <Button variant="ghost" size="icon" className="h-9 w-9" aria-label="关闭历史记录">
                    <X className="h-4 w-4" />
                  </Button>
                </DialogClose>
              </div>

              <ScrollArea className="min-h-0 flex-1">
                <div className="space-y-4 p-2">
                  {historyGroups.length === 0 ? (
                    <div className="py-10 text-center text-sm text-muted-foreground">暂无历史记录</div>
                  ) : (
                    historyGroups.map((group) => (
                      <div key={group.title} className="space-y-1">
                        <div className="px-2 text-xs font-medium text-muted-foreground/80">{group.title}</div>
                        <div className="space-y-1">
                          {group.items.map((session) => (
                            <button
                              key={session.id}
                              type="button"
                              className={cn(
                                'w-full rounded-md px-3 py-2 text-left text-sm transition-colors',
                                session.id === currentSessionId
                                  ? 'bg-primary/10 text-primary'
                                  : 'hover:bg-muted/50'
                              )}
                              onClick={() => openFromHistory(session.id)}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="truncate font-medium">{session.title}</span>
                                <span className="shrink-0 text-[10px] text-muted-foreground/80">
                                  {formatTime(session.updated_at)}
                                </span>
                              </div>
                              <div className="mt-0.5 text-[10px] text-muted-foreground/70">
                                {(session.message_count || 0) > 0 ? `${session.message_count} 条消息` : '暂无消息'}
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </div>
          </DialogPrimitive.Content>
        </DialogPortal>
      </Dialog>
    </div>
  )
}
