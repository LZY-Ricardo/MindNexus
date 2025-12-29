import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table'
import { toast } from '@/hooks/use-toast'
import {
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  Database,
  FileText,
  Folder,
  MessageSquare,
  RefreshCw,
  Search,
  Sparkles,
  Upload
} from 'lucide-react'

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
    } catch (error) {
      toast({
        variant: 'destructive',
        title: '统计加载失败',
        description: String(error?.message || error)
      })
      setStats(null)
    }
  }, [])

  const loadKnowledgeBases = useCallback(async () => {
    try {
      const list = await window.api.invoke('kb:list')
      setKnowledgeBases(Array.isArray(list) ? list : [])
    } catch (error) {
      toast({
        variant: 'destructive',
        title: '知识库加载失败',
        description: String(error?.message || error)
      })
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

  const total = stats?.total ?? 0
  const indexed = stats?.indexed ?? 0
  const failed = stats?.failed ?? 0
  const totalSize = stats?.totalSize ?? 0
  const sessionCount = stats?.sessionCount ?? 0
  const messageCount = stats?.messageCount ?? 0
  const indexRate = total ? Math.round((indexed / total) * 100) : 0
  const displayFiles = files
  const topTypes = (stats?.byType || []).slice(0, 4)
  const maxType = Math.max(...topTypes.map((i) => i.count || 0), 1)
  const kbSummary = [...knowledgeBases].sort(
    (a, b) => Number(b?.file_count || 0) - Number(a?.file_count || 0)
  )

  const renderStatusBadge = (status) => {
    if (!status) return <Badge variant="outline">-</Badge>
    if (status === 'indexed') return <Badge variant="secondary">已索引</Badge>
    if (status === 'error') return <Badge variant="destructive">失败</Badge>
    return <Badge variant="outline">{status}</Badge>
  }

  return (
    <div className="h-full overflow-auto space-y-4">
      <div className="relative overflow-hidden rounded-2xl border bg-card p-6">
        <div className="pointer-events-none absolute inset-0 opacity-60 [background:radial-gradient(circle_at_20%_20%,rgba(59,130,246,0.18),transparent_35%),radial-gradient(circle_at_80%_0%,rgba(168,85,247,0.15),transparent_30%)]" />
        <div className="relative flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-primary">
              <Sparkles className="h-4 w-4" />
              <span className="text-xs font-semibold uppercase">仪表盘</span>
            </div>
            <div className="space-y-1">
              <h2 className="text-2xl font-semibold tracking-tight">知识概览与快捷操作</h2>
              <p className="text-sm text-muted-foreground">
                已索引 {indexed} / {total} 个文件 · {knowledgeBases.length} 个知识库 ·{' '}
                {formatBytes(totalSize)}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => navigate('/search')}>
                <Search className="mr-2 h-4 w-4" />
                前往搜索
              </Button>
              <Button variant="outline" size="sm" onClick={() => navigate('/import')}>
                <Upload className="mr-2 h-4 w-4" />
                文件导入
              </Button>
              <Button variant="outline" size="sm" onClick={() => navigate('/analytics')}>
                <BarChart3 className="mr-2 h-4 w-4" />
                数据分析
              </Button>
            </div>
          </div>

          <div className="grid w-full gap-3 md:max-w-sm">
            <div className="rounded-xl border bg-background/70 p-4 shadow-sm">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">索引进度</span>
                <span className="text-muted-foreground">{indexRate}%</span>
              </div>
              <Progress value={indexRate} className="mt-2" />
              <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1 text-foreground">
                  <Sparkles className="h-3.5 w-3.5" />
                  {indexed} 已索引
                </span>
                <span className="flex items-center gap-1 text-amber-600">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {failed} 失败
                </span>
              </div>
            </div>
            <div className="rounded-xl border bg-background/70 p-4 shadow-sm">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">会话与消息</span>
                <ArrowUpRight className="h-4 w-4 text-primary" />
              </div>
              <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1 text-foreground">
                  <MessageSquare className="h-3.5 w-3.5" />
                  {sessionCount} 个会话
                </span>
                <span className="flex items-center gap-1">
                  <BarChart3 className="h-3.5 w-3.5" />
                  {messageCount} 条消息
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">文件总数</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">已索引</CardTitle>
            <Sparkles className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{indexed}</div>
            <p className="text-xs text-muted-foreground">成功率 {indexRate}%</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">索引失败</CardTitle>
            <AlertTriangle className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-amber-600">{failed}</div>
            <p className="text-xs text-muted-foreground">需要关注的异常任务</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">总大小</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{formatBytes(totalSize)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">知识库</CardTitle>
            <Folder className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{knowledgeBases.length}</div>
            <p className="text-xs text-muted-foreground">按文件数排序展示</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">会话 / 消息</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">
              {sessionCount} / {messageCount}
            </div>
            <p className="text-xs text-muted-foreground">聊天活跃度概览</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>最近文件</CardTitle>
              <div className="mt-1 text-xs text-muted-foreground">
                {loading ? '加载中...' : `共 ${files.length} 条 · 最多展示 100 条`}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <select
                className="h-9 rounded-md border bg-background px-3 text-xs shadow-sm"
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
                <RefreshCw className="mr-2 h-4 w-4" />
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
                {displayFiles.length === 0 && !loading && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground">
                      暂无数据（请先导入文件）
                    </TableCell>
                  </TableRow>
                )}

                {displayFiles.map((f) => {
                  const status = String(f?.status ?? '')
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
                      <TableCell className="max-w-[220px] truncate font-medium">
                        {f?.name ?? '-'}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{f?.type ?? '-'}</TableCell>
                      <TableCell className="text-xs">{formatBytes(f?.size)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {kbMap.get(f?.kb_id) || f?.kb_id || '-'}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate text-xs">
                        {tags.length ? tags.join(', ') : '-'}
                      </TableCell>
                      <TableCell>{renderStatusBadge(status)}</TableCell>
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

        <div className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>知识库概览</CardTitle>
              <span className="text-xs text-muted-foreground">按文件数排序</span>
            </CardHeader>
            <CardContent className="space-y-3">
              {kbSummary.length === 0 && (
                <div className="text-sm text-muted-foreground">暂无知识库</div>
              )}
              {kbSummary.slice(0, 4).map((kb) => (
                <div
                  key={kb.id}
                  className="flex items-center justify-between rounded-lg border px-3 py-2"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: kb.color || '#6366f1' }}
                    />
                    <div className="space-y-0.5">
                      <div className="text-sm font-medium leading-none">{kb.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {kb.description || '暂无描述'}
                      </div>
                    </div>
                  </div>
                  <Badge variant="outline">{kb.file_count ?? 0} 个文件</Badge>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>文件类型分布</CardTitle>
              <span className="text-xs text-muted-foreground">Top 4</span>
            </CardHeader>
            <CardContent className="space-y-3">
              {topTypes.length === 0 && (
                <div className="text-sm text-muted-foreground">暂无数据</div>
              )}
              {topTypes.map((item) => (
                <div key={item.type || 'unknown'} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span>{item.type || '未知类型'}</span>
                    <span className="text-muted-foreground">{item.count}</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted">
                    <div
                      className="h-2 rounded-full bg-primary"
                      style={{ width: `${(item.count / maxType) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
