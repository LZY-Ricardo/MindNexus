import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table'
import { toast } from '@/hooks/use-toast'

function formatBytes(bytes) {
  if (typeof bytes !== 'number' || Number.isNaN(bytes) || bytes < 0) return '-'
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes / 1024
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`
}

export default function Dashboard() {
  const navigate = useNavigate()
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState(null)
  const [knowledgeBases, setKnowledgeBases] = useState([])
  const [kbFilter, setKbFilter] = useState('')

  const kbMap = useMemo(() => {
    const map = new Map()
    for (const kb of knowledgeBases) {
      map.set(kb.id, kb.name)
    }
    return map
  }, [knowledgeBases])

  const loadFiles = useCallback(async () => {
    setLoading(true)
    try {
      const list = await window.api.invoke('file:list', {
        limit: 100,
        kbId: kbFilter || undefined
      })
      setFiles(Array.isArray(list) ? list : [])
    } catch (error) {
      const msg = String(error?.message || error)
      toast({ variant: 'destructive', title: '加载失败', description: msg })
      setFiles([])
    } finally {
      setLoading(false)
    }
  }, [kbFilter])

  const loadStats = useCallback(async () => {
    try {
      const overview = await window.api.invoke('analytics:overview')
      setStats(overview || null)
    } catch {
      setStats(null)
    }
  }, [])

  const loadKnowledgeBases = useCallback(async () => {
    try {
      const list = await window.api.invoke('kb:list')
      setKnowledgeBases(Array.isArray(list) ? list : [])
    } catch {
      setKnowledgeBases([])
    }
  }, [])

  useEffect(() => {
    void loadFiles()
  }, [loadFiles])

  useEffect(() => {
    void loadStats()
    void loadKnowledgeBases()
  }, [loadStats, loadKnowledgeBases])

  const onDelete = async (uuid) => {
    if (!uuid) return
    const ok = window.confirm('确认删除该文件记录及其向量数据？')
    if (!ok) return

    try {
      const res = await window.api.invoke('file:delete', { uuid })
      if (res?.success === false) throw new Error(res?.message || '删除失败')
      toast({ title: '已删除', description: uuid })
      await loadFiles()
      await loadStats()
    } catch (error) {
      const msg = String(error?.message || error)
      toast({ variant: 'destructive', title: '删除失败', description: msg })
    }
  }

  const onOpenFile = async (uuid) => {
    if (!uuid) return
    try {
      const ok = await window.api.invoke('file:open', { uuid })
      if (!ok) {
        toast({ variant: 'destructive', title: '打开失败', description: '无法打开该文件' })
      }
    } catch (error) {
      toast({
        variant: 'destructive',
        title: '打开失败',
        description: String(error?.message || error)
      })
    }
  }

  const onEditTags = async (uuid, currentTags) => {
    const current = Array.isArray(currentTags) ? currentTags.join(', ') : ''
    const next = window.prompt('请输入标签（用逗号分隔）', current)
    if (next == null) return
    const tags = next
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
    try {
      await window.api.invoke('file:set-tags', { uuid, tags })
      await loadFiles()
    } catch (error) {
      toast({
        variant: 'destructive',
        title: '更新标签失败',
        description: String(error?.message || error)
      })
    }
  }

  return (
    <div className="h-full overflow-auto">
      <div className="grid gap-4 lg:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle>文件总数</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{stats?.total ?? '-'}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>已索引</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{stats?.indexed ?? '-'}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>失败</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{stats?.failed ?? '-'}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>会话数</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{stats?.sessionCount ?? '-'}</CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>快捷入口</CardTitle>
          <div className="text-xs text-muted-foreground">常用操作快速到达</div>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate('/import')}>
            文件导入
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate('/search')}>
            搜索中心
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate('/knowledge')}>
            知识库管理
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate('/backup')}>
            备份恢复
          </Button>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>文件列表</CardTitle>
            <div className="mt-1 text-xs text-muted-foreground">
              {loading ? '加载中…' : `共 ${files.length} 条`}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <select
              className="h-8 rounded-md border bg-background px-2 text-xs"
              value={kbFilter}
              onChange={(e) => setKbFilter(e.target.value)}
            >
              <option value="">全部知识库</option>
              {knowledgeBases.map((kb) => (
                <option key={kb.id} value={kb.id}>
                  {kb.name}
                </option>
              ))}
            </select>
            <Button variant="outline" size="sm" onClick={loadFiles} disabled={loading}>
              刷新
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>名称</TableHead>
                <TableHead>类型</TableHead>
                <TableHead>大小</TableHead>
                <TableHead>知识库</TableHead>
                <TableHead>标签</TableHead>
                <TableHead>状态</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {files.length === 0 && !loading && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    暂无数据（请在文件导入页导入文件）
                  </TableCell>
                </TableRow>
              )}

              {files.map((f) => {
                const status = String(f?.status ?? '')
                const statusVariant =
                  status === 'indexed'
                    ? 'secondary'
                    : status === 'error'
                      ? 'destructive'
                      : 'outline'
                const tags = (() => {
                  try {
                    const parsed = JSON.parse(f?.tags || '[]')
                    return Array.isArray(parsed) ? parsed : []
                  } catch {
                    return []
                  }
                })()

                return (
                  <TableRow key={f?.uuid}>
                    <TableCell className="max-w-[220px] truncate">{f?.name ?? '-'}</TableCell>
                    <TableCell>{f?.type ?? '-'}</TableCell>
                    <TableCell>{formatBytes(f?.size)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {kbMap.get(f?.kb_id) || f?.kb_id || '-'}
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate text-xs">
                      {tags.length ? tags.join(', ') : '-'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant}>{status || '-'}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onOpenFile(f?.uuid)}
                          disabled={!f?.uuid}
                        >
                          打开
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onEditTags(f?.uuid, tags)}
                          disabled={!f?.uuid}
                        >
                          标签
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => onDelete(f?.uuid)}
                          disabled={!f?.uuid}
                        >
                          删除
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
