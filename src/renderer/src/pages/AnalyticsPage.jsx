import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

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

export default function AnalyticsPage() {
  const [data, setData] = useState(null)
  const [knowledgeBases, setKnowledgeBases] = useState([])

  const kbMap = useMemo(() => {
    const map = new Map()
    for (const kb of knowledgeBases) {
      map.set(kb.id, kb.name)
    }
    return map
  }, [knowledgeBases])

  const load = useCallback(async () => {
    const overview = await window.api.invoke('analytics:overview')
    setData(overview || null)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const loadKb = async () => {
      const list = await window.api.invoke('kb:list')
      setKnowledgeBases(Array.isArray(list) ? list : [])
    }
    void loadKb()
  }, [])

  const maxType = Math.max(...(data?.byType || []).map((i) => i.count), 1)
  const maxKb = Math.max(...(data?.byKb || []).map((i) => i.count), 1)

  return (
    <div className="h-full overflow-auto space-y-4">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={load}>
          刷新
        </Button>
      </div>
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle>文件总数</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{data?.total ?? '-'}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>已索引</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{data?.indexed ?? '-'}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>失败</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{data?.failed ?? '-'}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>总大小</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            {formatBytes(data?.totalSize ?? 0)}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>文件类型分布</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {(data?.byType || []).length === 0 && (
            <div className="text-sm text-muted-foreground">暂无数据</div>
          )}
          {(data?.byType || []).map((item) => (
            <div key={item.type || 'unknown'} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span>{item.type || '未知'}</span>
                <span>{item.count}</span>
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

      <Card>
        <CardHeader>
          <CardTitle>知识库分布</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {(data?.byKb || []).length === 0 && (
            <div className="text-sm text-muted-foreground">暂无数据</div>
          )}
          {(data?.byKb || []).map((item) => (
            <div key={item.id || 'unknown'} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span>{kbMap.get(item.id) || item.id || '未知'}</span>
                <span>{item.count}</span>
              </div>
              <div className="h-2 rounded-full bg-muted">
                <div
                  className="h-2 rounded-full bg-primary"
                  style={{ width: `${(item.count / maxKb) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
