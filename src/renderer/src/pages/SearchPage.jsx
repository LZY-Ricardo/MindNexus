import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { toast } from '@/hooks/use-toast'
import { useStore } from '@/lib/store'

const SEARCH_MODES = [
  { value: 'semantic', label: '语义' },
  { value: 'keyword', label: '关键词' },
  { value: 'hybrid', label: '混合' }
]

export default function SearchPage() {
  const config = useStore((s) => s.config)
  const [query, setQuery] = useState('')
  const [mode, setMode] = useState('hybrid')
  const [kbId, setKbId] = useState('')
  const [tagsInput, setTagsInput] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [knowledgeBases, setKnowledgeBases] = useState([])
  const kbMap = useMemo(() => {
    const map = new Map()
    for (const kb of knowledgeBases) {
      map.set(kb.id, kb.name)
    }
    return map
  }, [knowledgeBases])

  const loadKnowledgeBases = useCallback(async () => {
    try {
      const list = await window.api.invoke('kb:list')
      setKnowledgeBases(Array.isArray(list) ? list : [])
    } catch {
      setKnowledgeBases([])
    }
  }, [])

  useEffect(() => {
    void loadKnowledgeBases()
  }, [loadKnowledgeBases])

  useEffect(() => {
    if (config?.defaultSearchMode) {
      setMode(config.defaultSearchMode)
    }
  }, [config])

  const runSearch = async () => {
    if (!query.trim()) return
    setLoading(true)
    try {
      const tags = tagsInput
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
      const options = {
        mode,
        limit: 20,
        kbId: kbId || null,
        types: typeFilter ? [typeFilter] : null,
        tags: tags.length > 0 ? tags : null,
        dateFrom: dateFrom || null,
        dateTo: dateTo || null
      }
      const list = await window.api.invoke('search:query', { query, options })
      setResults(Array.isArray(list) ? list : [])
    } catch (error) {
      toast({ variant: 'destructive', title: '搜索失败', description: String(error) })
    } finally {
      setLoading(false)
    }
  }

  const openFile = async (uuid) => {
    if (!uuid) return
    const ok = await window.api.invoke('file:open', { uuid })
    if (!ok) {
      toast({ variant: 'destructive', title: '打开失败', description: '无法打开该文件' })
    }
  }

  return (
    <div className="h-full overflow-auto space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>搜索中心</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {SEARCH_MODES.map((item) => (
              <Button
                key={item.value}
                variant={mode === item.value ? 'default' : 'outline'}
                size="sm"
                onClick={() => setMode(item.value)}
              >
                {item.label}
              </Button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="输入关键词或问题"
              onKeyDown={(e) => {
                if (e.key === 'Enter') runSearch()
              }}
            />
            <Button onClick={runSearch} disabled={!query.trim() || loading}>
              {loading ? '搜索中…' : '搜索'}
            </Button>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <div className="text-sm font-medium">知识库</div>
              <select
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                value={kbId}
                onChange={(e) => setKbId(e.target.value)}
              >
                <option value="">全部知识库</option>
                {knowledgeBases.map((kb) => (
                  <option key={kb.id} value={kb.id}>
                    {kb.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <div className="text-sm font-medium">文件类型</div>
              <select
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
              >
                <option value="">全部类型</option>
                <option value="pdf">PDF</option>
                <option value="docx">DOCX</option>
                <option value="md">Markdown</option>
                <option value="txt">TXT</option>
              </select>
            </div>
            <div className="space-y-2">
              <div className="text-sm font-medium">标签</div>
              <Input
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="多个标签用逗号分隔"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2">
                <div className="text-sm font-medium">开始日期</div>
                <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
              </div>
              <div className="space-y-2">
                <div className="text-sm font-medium">结束日期</div>
                <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>搜索结果</CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="max-h-[520px]">
            <div className="space-y-3">
              {results.length === 0 && !loading && (
                <div className="text-sm text-muted-foreground">暂无结果</div>
              )}
              {results.map((item) => (
                <div key={item.uuid} className="rounded-lg border px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{item.name}</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        类型：{item.type || '-'} · 知识库：{kbMap.get(item.kb_id) || item.kb_id || '-'}
                      </div>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => openFile(item.uuid)}>
                      打开
                    </Button>
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground">
                    匹配度：{typeof item.score === 'number' ? item.score.toFixed(2) : '-'}
                  </div>
                  {item.snippet && (
                    <div className="mt-2 text-sm text-muted-foreground line-clamp-3">
                      {item.snippet}
                    </div>
                  )}
                  <div className="mt-2 flex flex-wrap gap-1">
                    {item.tags?.length ? (
                      item.tags.map((tag) => (
                        <Badge key={tag} variant="secondary">
                          {tag}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-xs text-muted-foreground">无标签</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  )
}
