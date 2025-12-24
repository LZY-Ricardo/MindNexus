import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import MessageBubble from '@/components/MessageBubble'
import { toast } from '@/hooks/use-toast'
import { useStore } from '@/lib/store'

export default function ChatPage() {
  const ollamaModel = useStore((s) => s.ollamaModel)
  const messages = useStore((s) => s.currentChatHistory)
  const appendChatMessage = useStore((s) => s.appendChatMessage)
  const updateLastAssistantMessage = useStore((s) => s.updateLastAssistantMessage)

  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)

  const bottomRef = useRef(null)

  const historyForApi = useMemo(
    () =>
      messages
        .filter((m) => m && typeof m === 'object')
        .map((m) => ({ role: String(m.role ?? 'user'), content: String(m.content ?? '') })),
    [messages]
  )

  useEffect(() => {
    const off = window.api.on('rag:chat-token', (data) => {
      const token = String(data?.token ?? '')
      const done = Boolean(data?.done)

      if (token) {
        updateLastAssistantMessage((last) => ({
          ...last,
          content: `${last?.content ?? ''}${token}`
        }))
      }

      if (done) setStreaming(false)
    })

    return () => off?.()
  }, [updateLastAssistantMessage])

  useEffect(() => {
    const off = window.api.on('rag:sources', (data) => {
      const sources = Array.isArray(data) ? data : []

      const history = useStore.getState().currentChatHistory
      const last = history[history.length - 1]

      if (last?.role === 'assistant') {
        updateLastAssistantMessage((prev) => ({ ...prev, sources }))
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
    if (!q || streaming) return

    setInput('')
    appendChatMessage({ role: 'user', content: q })
    appendChatMessage({ role: 'assistant', content: '', sources: [] })
    setStreaming(true)

    try {
      await window.api.chatStart(q, historyForApi, ollamaModel)
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
    <div className="flex h-full flex-col gap-3">
      <div className="text-xs text-muted-foreground">当前模型：{ollamaModel}</div>
      <ScrollArea className="min-h-0 flex-1 rounded-md border bg-card">
        <div className="space-y-4 p-4">
          {messages.length === 0 && (
            <div className="text-sm text-muted-foreground">输入问题并发送，开始 RAG 对话。</div>
          )}

          {messages.map((m, idx) => (
            <MessageBubble
              key={idx}
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
        <Button onClick={send} disabled={streaming || !input.trim()}>
          {streaming ? '生成中…' : '发送'}
        </Button>
      </div>
    </div>
  )
}
