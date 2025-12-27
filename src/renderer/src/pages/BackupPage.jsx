import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { toast } from '@/hooks/use-toast'

export default function BackupPage() {
  const [note, setNote] = useState('')
  const [backups, setBackups] = useState([])
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    const list = await window.api.invoke('backup:list')
    setBackups(Array.isArray(list) ? list : [])
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const createBackup = async () => {
    setLoading(true)
    try {
      const res = await window.api.invoke('backup:create', { note })
      if (res?.success) {
        toast({ title: '备份完成' })
        setNote('')
        await load()
      }
    } catch (error) {
      toast({ variant: 'destructive', title: '备份失败', description: String(error) })
    } finally {
      setLoading(false)
    }
  }

  const restoreBackup = async (id) => {
    const ok = window.confirm('恢复备份将重启应用，确认继续？')
    if (!ok) return
    await window.api.invoke('backup:restore', { id })
  }

  const deleteBackup = async (id) => {
    const ok = window.confirm('确认删除该备份？')
    if (!ok) return
    await window.api.invoke('backup:delete', { id })
    await load()
  }

  return (
    <div className="h-full overflow-auto space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>创建备份</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="备份说明（可选）"
          />
          <Button onClick={createBackup} disabled={loading}>
            {loading ? '备份中…' : '开始备份'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>备份列表</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {backups.length === 0 && (
            <div className="text-sm text-muted-foreground">暂无备份</div>
          )}
          {backups.map((backup) => (
            <div
              key={backup.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3"
            >
              <div>
                <div className="text-sm font-medium">{backup.id}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {backup.note || '无说明'} · 文件数：{backup.fileCount || 0} · 知识库：
                  {backup.kbCount || 0}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={() => restoreBackup(backup.id)}>
                  恢复
                </Button>
                <Button variant="destructive" size="sm" onClick={() => deleteBackup(backup.id)}>
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
