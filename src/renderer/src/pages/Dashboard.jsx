import { useCallback, useEffect, useState } from 'react'
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
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(true)

  const loadFiles = useCallback(async () => {
    setLoading(true)
    try {
      const list = await window.api.invoke('file:list', { limit: 100 })
      setFiles(Array.isArray(list) ? list : [])
    } catch (error) {
      const msg = String(error?.message || error)
      toast({ variant: 'destructive', title: '加载失败', description: msg })
      setFiles([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadFiles()
  }, [loadFiles])

  const onDelete = async (uuid) => {
    if (!uuid) return
    const ok = window.confirm('确认删除该文件记录及其向量数据？')
    if (!ok) return

    try {
      const res = await window.api.invoke('file:delete', { uuid })
      if (res?.success === false) throw new Error(res?.message || '删除失败')
      toast({ title: '已删除', description: uuid })
      await loadFiles()
    } catch (error) {
      const msg = String(error?.message || error)
      toast({ variant: 'destructive', title: '删除失败', description: msg })
    }
  }

  return (
    <div className="h-full overflow-auto">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>文件列表</CardTitle>
            <div className="mt-1 text-xs text-muted-foreground">
              {loading ? '加载中…' : `共 ${files.length} 条`}
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={loadFiles} disabled={loading}>
            刷新
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>名称</TableHead>
                <TableHead>类型</TableHead>
                <TableHead>大小</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>UUID</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {files.length === 0 && !loading && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    暂无数据（先在悬浮窗拖入文件进行摄入）
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

                return (
                  <TableRow key={f?.uuid}>
                    <TableCell className="max-w-[220px] truncate">{f?.name ?? '-'}</TableCell>
                    <TableCell>{f?.type ?? '-'}</TableCell>
                    <TableCell>{formatBytes(f?.size)}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant}>{status || '-'}</Badge>
                    </TableCell>
                    <TableCell className="max-w-[240px] truncate font-mono text-xs">
                      {f?.uuid ?? '-'}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => onDelete(f?.uuid)}
                        disabled={!f?.uuid}
                      >
                        删除
                      </Button>
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
