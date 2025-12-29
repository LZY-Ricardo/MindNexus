import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertCircle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Card, CardContent } from '@/components/ui/card'
import MessageBubble from '@/components/MessageBubble'
import { toast } from '@/hooks/use-toast'
import { useStore } from '@/lib/store'

function formatTime(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString()
}

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
  const checkOllamaStatus = useStore((s) => s.checkOllamaStatus)

  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [knowledgeBases, setKnowledgeBases] = useState([])

  // 页面加载时检测 Ollama 状态
  useEffect(() => {
    void checkOllamaStatus()
  }, [checkOllamaStatus])

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

  const send = async () => {
    const q = input.trim()
    if (!q || streaming || !currentSessionId) return

    setInput('')
    setStreaming(true)

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
    <div className="flex h-full gap-4">
      <div className="flex w-60 shrink-0 flex-col gap-3 rounded-md border bg-card p-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium">会话列表</div>
          <Button size="sm" onClick={createSession}>
            新建
          </Button>
        </div>
        <ScrollArea className="min-h-0 flex-1 rounded-md border bg-background">
          <div className="space-y-1 p-2">
            {sessions.map((session) => (
              <button
                key={session.id}
                type="button"
                className={`w-full rounded-md px-2 py-2 text-left text-sm transition ${
                  session.id === currentSessionId
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:bg-accent/50'
                }`}
                onClick={() => setCurrentSessionId(session.id)}
              >
                <div className="truncate font-medium">{session.title}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {session.message_count || 0} 条 · {formatTime(session.updated_at * 1000)}
                </div>
              </button>
            ))}
            {sessions.length === 0 && (
              <div className="px-2 py-4 text-xs text-muted-foreground">暂无会话</div>
            )}
          </div>
        </ScrollArea>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs text-muted-foreground">当前模型：{ollamaModel}</div>
          <div className="flex items-center gap-2">
            <select
              className="h-8 rounded-md border bg-background px-2 text-xs"
              value={currentKbId}
              onChange={(e) => {
                void handleKbChange(e.target.value)
              }}
            >
              {knowledgeBases.length === 0 && <option value="default">默认知识库</option>}
              {knowledgeBases.map((kb) => (
                <option key={kb.id} value={kb.id}>
                  {kb.name}
                </option>
              ))}
            </select>
            <Button variant="outline" size="sm" onClick={renameSession} disabled={!currentSessionId}>
              重命名
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={deleteSession}
              disabled={!currentSessionId}
            >
              删除会话
            </Button>
          </div>
        </div>

        {ollamaStatus === 'disconnected' && (
          <Card className="border-orange-500/20 bg-orange-500/5">
            <CardContent className="flex items-center gap-3 p-3 text-sm text-orange-600">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <div className="flex-1">
                <span className="font-medium">Ollama 服务未连接</span>
                <span className="mx-1">·</span>
                <span className="opacity-80">对话功能需要先启动 Ollama 服务</span>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => void checkOllamaStatus()}
              >
                <RefreshCw className="mr-1 h-3 w-3" />
                重新检测
              </Button>
            </CardContent>
          </Card>
        )}

        <ScrollArea className="min-h-0 flex-1 rounded-md border bg-card">
          <div className="space-y-4 p-4">
            {messages.length === 0 && (
              <div className="text-sm text-muted-foreground">
                输入问题并发送，开始 RAG 对话。
              </div>
            )}

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
          </div>
        </ScrollArea>

        <div className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="输入你的问题，回车发送"
            disabled={streaming}
          />
          <Button onClick={send} disabled={streaming || !input.trim() || !currentSessionId}>
            {streaming ? '生成中…' : '发送'}
          </Button>
        </div>
      </div>
    </div>
  )
}
