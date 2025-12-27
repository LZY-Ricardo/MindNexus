import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useStore } from '@/lib/store'

function formatTime(value) {
  if (!value) return '-'
  const date = new Date(value * 1000)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString()
}

export default function SessionsPage() {
  const [sessions, setSessions] = useState([])
  const [knowledgeBases, setKnowledgeBases] = useState([])
  const navigate = useNavigate()
  const setCurrentSessionId = useStore((s) => s.setCurrentSessionId)

  const load = useCallback(async () => {
    const list = await window.api.invoke('session:list')
    setSessions(Array.isArray(list) ? list : [])
  }, [])

  const loadKnowledgeBases = useCallback(async () => {
    const list = await window.api.invoke('kb:list')
    setKnowledgeBases(Array.isArray(list) ? list : [])
  }, [])

  useEffect(() => {
    void load()
    void loadKnowledgeBases()
  }, [load, loadKnowledgeBases])

  const kbName = (id) => {
    const item = knowledgeBases.find((kb) => kb.id === id)
    return item?.name || id || '-'
  }

  const openSession = (id) => {
    setCurrentSessionId(id)
    navigate('/chat')
  }

  const renameSession = async (session) => {
    const nextTitle = window.prompt('请输入新会话名称', session.title)
    if (!nextTitle) return
    await window.api.invoke('session:update', { id: session.id, title: nextTitle, model: session.model })
    await load()
  }

  const deleteSession = async (session) => {
    const ok = window.confirm('确认删除该会话及其消息？')
    if (!ok) return
    await window.api.invoke('session:delete', { id: session.id })
    await load()
  }

  return (
    <div className="h-full overflow-auto">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>会话管理</CardTitle>
          <Button variant="outline" size="sm" onClick={load}>
            刷新
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {sessions.length === 0 && (
            <div className="text-sm text-muted-foreground">暂无会话</div>
          )}
          {sessions.map((session) => (
            <div
              key={session.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3"
            >
              <div>
                <div className="flex items-center gap-2 text-sm font-medium">
                  {session.title}
                  <Badge variant="outline">{session.message_count || 0} 条</Badge>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  知识库：{kbName(session.kb_id)} · 更新时间：{formatTime(session.updated_at)}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={() => openSession(session.id)}>
                  打开
                </Button>
                <Button variant="outline" size="sm" onClick={() => renameSession(session)}>
                  重命名
                </Button>
                <Button variant="destructive" size="sm" onClick={() => deleteSession(session)}>
                  删除
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
