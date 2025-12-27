import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { toast } from '@/hooks/use-toast'

const DEFAULT_COLOR = '#6366f1'

export default function KnowledgePage() {
  const [knowledgeBases, setKnowledgeBases] = useState([])
  const [loading, setLoading] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState({ name: '', description: '', color: DEFAULT_COLOR })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const list = await window.api.invoke('kb:list')
      setKnowledgeBases(Array.isArray(list) ? list : [])
    } catch (error) {
      toast({ variant: 'destructive', title: '加载失败', description: String(error) })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const openCreate = () => {
    setEditingId(null)
    setForm({ name: '', description: '', color: DEFAULT_COLOR })
    setDialogOpen(true)
  }

  const openEdit = (kb) => {
    setEditingId(kb.id)
    setForm({
      name: kb.name || '',
      description: kb.description || '',
      color: kb.color || DEFAULT_COLOR
    })
    setDialogOpen(true)
  }

  const save = async () => {
    if (!form.name.trim()) {
      toast({ variant: 'destructive', title: '名称不能为空' })
      return
    }
    try {
      if (editingId) {
        await window.api.invoke('kb:update', {
          id: editingId,
          name: form.name,
          description: form.description,
          color: form.color
        })
      } else {
        await window.api.invoke('kb:create', {
          name: form.name,
          description: form.description,
          color: form.color
        })
      }
      setDialogOpen(false)
      await load()
    } catch (error) {
      toast({ variant: 'destructive', title: '保存失败', description: String(error) })
    }
  }

  const setDefault = async (id) => {
    await window.api.invoke('kb:set-default', { id })
    await load()
  }

  const remove = async (kb) => {
    const canMove = knowledgeBases.filter((item) => item.id !== kb.id).length > 0
    let moveTo = ''
    if (canMove) {
      const move = window.confirm('删除后是否将文件迁移到默认知识库？')
      moveTo = move ? 'default' : ''
    }
    const ok = window.confirm('确认删除该知识库？')
    if (!ok) return
    await window.api.invoke('kb:delete', { id: kb.id, moveTo })
    await load()
  }

  return (
    <div className="h-full overflow-auto space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>知识库管理</CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              刷新
            </Button>
            <Button size="sm" onClick={openCreate}>
              新建知识库
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {knowledgeBases.length === 0 && (
            <div className="text-sm text-muted-foreground">暂无知识库</div>
          )}
          {knowledgeBases.map((kb) => (
            <div
              key={kb.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <div
                  className="h-4 w-4 rounded-full"
                  style={{ backgroundColor: kb.color || DEFAULT_COLOR }}
                />
                <div>
                  <div className="flex items-center gap-2 text-sm font-medium">
                    {kb.name}
                    {kb.is_default ? <Badge variant="secondary">默认</Badge> : null}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {kb.description || '暂无描述'} · 文件数：{kb.file_count || 0}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {!kb.is_default && (
                  <Button variant="outline" size="sm" onClick={() => setDefault(kb.id)}>
                    设为默认
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={() => openEdit(kb)}>
                  编辑
                </Button>
                {!kb.is_default && (
                  <Button variant="destructive" size="sm" onClick={() => remove(kb)}>
                    删除
                  </Button>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? '编辑知识库' : '新建知识库'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <div className="text-sm font-medium">名称</div>
              <Input
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="例如：工作资料"
              />
            </div>
            <div className="space-y-2">
              <div className="text-sm font-medium">描述</div>
              <textarea
                className="min-h-[80px] w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={form.description}
                onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                placeholder="简单说明该知识库用途"
              />
            </div>
            <div className="space-y-2">
              <div className="text-sm font-medium">主题色</div>
              <Input
                value={form.color}
                onChange={(e) => setForm((prev) => ({ ...prev, color: e.target.value }))}
                placeholder="#6366f1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={save}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
