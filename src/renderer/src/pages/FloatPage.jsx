import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ToastAction } from '@/components/ui/toast'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

export default function FloatPage() {
  const navigate = useNavigate()
  const inputRef = useRef(null)
  const dragCounterRef = useRef(0)
  const activeIngestRef = useRef({ filePath: '', uuid: '', index: 0, total: 1 })

  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [isDragging, setIsDragging] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [progressValue, setProgressValue] = useState(0)
  const [processingMessage, setProcessingMessage] = useState('')

  const expanded = useMemo(
    () => isSearching || isProcessing || (Array.isArray(results) && results.length > 0),
    [isSearching, isProcessing, results]
  )

  const collapse = useCallback(() => {
    setResults([])
    setProgressValue(0)
    setIsSearching(false)
    window.api?.setSize?.(680, 60)
  }, [])

  const closeFloat = useCallback(() => {
    window.api?.toggleFloat?.()
    navigate('/')
  }, [navigate])

  const runSearch = useCallback(async () => {
    const q = query.trim()
    if (!q) return collapse()

    setIsSearching(true)
    try {
      window.api?.setSize?.(680, 400)
      const list = await window.api.search(q, 5)
      setResults(Array.isArray(list) ? list : [])
    } catch (error) {
      const msg = String(error?.message || error)
      toast({ variant: 'destructive', title: '搜索失败', description: msg })
    } finally {
      setIsSearching(false)
    }
  }, [collapse, query])

  const handleDropFiles = useCallback(
    async (files) => {
      if (!files.length) return

      setIsProcessing(true)
      setProgressValue(0)
      setProcessingMessage('')
      window.api?.setSize?.(680, 400)

      const infoToast = toast({
        title: '开始处理',
        description: `已接收 ${files.length} 个文件`
      })

      try {
        let successCount = 0
        let chunkTotal = 0
        const failures = []

        for (let i = 0; i < files.length; i += 1) {
          const file = files[i]
          const filePath = file?.path

          activeIngestRef.current = {
            filePath: filePath || '',
            uuid: '',
            index: i,
            total: files.length
          }

          let input = filePath
          if (!filePath) {
            try {
              setProcessingMessage(`读取文件数据：${file?.name ?? '未知文件'}`)
              const data = await file.arrayBuffer()
              input = { fileName: file?.name ?? 'file', data }
            } catch (error) {
              const msg = String(error?.message || error)
              failures.push({ name: file?.name ?? '未知文件', message: `读取文件失败: ${msg}` })
              setProcessingMessage(`失败：${file?.name ?? '未知文件'}（读取失败）`)
              setProgressValue(Math.round(((i + 1) / files.length) * 100))
              continue
            }
          }

          setProcessingMessage(`准备导入：${file?.name ?? '未知文件'}`)
          setProgressValue(Math.round((i / files.length) * 100))
          const res = await window.api.processFile(input)
          if (res?.success) {
            successCount += 1
            chunkTotal += Number(res?.chunks ?? 0) || 0
          } else {
            const message = String(res?.message ?? '未知错误')
            failures.push({ name: file?.name ?? '未知文件', message })
            setProcessingMessage(`失败：${file?.name ?? '未知文件'}（${message}）`)
          }
          setProgressValue(Math.round(((i + 1) / files.length) * 100))
        }

        activeIngestRef.current = { filePath: '', uuid: '', index: 0, total: 1 }

        const title =
          successCount === files.length
            ? '索引完成'
            : successCount === 0
              ? '索引失败'
              : '索引完成（部分失败）'

        const summary = `成功 ${successCount}/${files.length}，共写入 ${chunkTotal} 个文本块。`
        const details = failures.length
          ? failures
              .slice(0, 2)
              .map((item) => `${item.name}：${item.message}`)
              .concat(failures.length > 2 ? `……（还有 ${failures.length - 2} 个失败）` : [])
              .join('\n')
          : ''

        infoToast.update({
          variant: successCount === 0 ? 'destructive' : 'default',
          title,
          description: details ? `${summary}\n${details}` : summary,
          action: (
            <ToastAction altText="查看仪表盘" onClick={closeFloat}>
              查看仪表盘
            </ToastAction>
          ),
          open: true
        })
      } catch (error) {
        const msg = String(error?.message || error)
        toast({ variant: 'destructive', title: '处理异常', description: msg })
      } finally {
        setIsProcessing(false)
        setProcessingMessage('')
        activeIngestRef.current = { filePath: '', uuid: '', index: 0, total: 1 }
        setTimeout(() => setProgressValue(0), 400)
      }
    },
    [closeFloat]
  )

  useEffect(() => {
    if (!window.api?.on) return

    return window.api.on('file:process-progress', (payload) => {
      if (!payload) return

      const incomingUuid = String(payload?.uuid ?? '')
      if (!incomingUuid) return

      if (activeIngestRef.current.uuid && activeIngestRef.current.uuid !== incomingUuid) return
      if (!activeIngestRef.current.uuid) activeIngestRef.current.uuid = incomingUuid

      const p = Number(payload?.progress)
      if (Number.isFinite(p)) {
        const index = activeIngestRef.current.index
        const total = activeIngestRef.current.total || 1
        const overall = Math.round(((index + p / 100) / total) * 100)
        setProgressValue(overall)
      }

      if (payload?.message) setProcessingMessage(String(payload.message))
    })
  }, [])

  useEffect(() => {
    inputRef.current?.focus?.()
    window.api?.setSize?.(680, 60)

    const onKeyDown = (e) => {
      if (e.key === 'Escape') closeFloat()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [closeFloat])

  useEffect(() => {
    const prevent = (e) => {
      e.preventDefault()
      e.stopPropagation()
    }

    const onDragEnter = (e) => {
      prevent(e)
      dragCounterRef.current += 1
      setIsDragging(true)
    }

    const onDragLeave = (e) => {
      prevent(e)
      dragCounterRef.current -= 1
      if (dragCounterRef.current <= 0) {
        dragCounterRef.current = 0
        setIsDragging(false)
      }
    }

    const onDragOver = (e) => {
      prevent(e)
    }

    const onDrop = async (e) => {
      prevent(e)
      dragCounterRef.current = 0
      setIsDragging(false)

      const files = Array.from(e.dataTransfer?.files ?? [])
      await handleDropFiles(files)
    }

    window.addEventListener('dragenter', onDragEnter)
    window.addEventListener('dragleave', onDragLeave)
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('drop', onDrop)

    return () => {
      window.removeEventListener('dragenter', onDragEnter)
      window.removeEventListener('dragleave', onDragLeave)
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('drop', onDrop)
    }
  }, [handleDropFiles])

  const onInputKeyDown = (e) => {
    if (e.key === 'Enter') runSearch()
  }

  const onResultClick = async () => {
    await window.api?.openMain?.()
  }

  const containerHeight = expanded ? 'h-[400px]' : 'h-[60px]'

  return (
    <div className="relative flex min-h-[calc(100vh-2rem)] items-start justify-center pt-10">
      {isDragging && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-xl border-2 border-dashed border-primary bg-primary/20 text-sm font-semibold text-primary">
          Release to upload
        </div>
      )}

      <Card
        className={cn(
          'w-full max-w-2xl overflow-hidden rounded-xl border bg-background/80 shadow-xl backdrop-blur-xl transition-[height]',
          containerHeight
        )}
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center gap-2 p-2">
            <Input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onInputKeyDown}
              placeholder="搜索或拖拽文件到此处"
              className="h-11"
            />
            <Button variant="ghost" size="icon" onClick={closeFloat} aria-label="关闭悬浮窗">
              <X className="h-4 w-4" />
            </Button>
          </div>

          {isProcessing && (
            <div className="px-2 pb-2">
              {processingMessage && (
                <div className="mb-2 text-xs text-muted-foreground">{processingMessage}</div>
              )}
              <Progress value={progressValue || 15} />
            </div>
          )}

          {expanded && (
            <div className="min-h-0 flex-1 border-t">
              <ScrollArea className="h-full">
                <div className="space-y-2 p-3">
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-muted-foreground">
                      {isSearching ? '搜索中…' : '搜索结果'}
                    </div>
                    <Button variant="outline" size="sm" onClick={collapse}>
                      收起
                    </Button>
                  </div>

                  {!isSearching && results.length === 0 && (
                    <div className="text-sm text-muted-foreground">暂无结果</div>
                  )}

                  <div className="space-y-2">
                    {results.map((item, idx) => (
                      <button
                        key={`${item?.source_uuid ?? 'x'}-${idx}`}
                        type="button"
                        onClick={onResultClick}
                        className="w-full rounded-md border bg-card px-3 py-2 text-left transition-colors hover:bg-accent/50"
                      >
                        <div className="text-sm leading-5">{item?.text ?? ''}</div>
                        <div className="mt-2 flex items-center gap-2">
                          <Badge variant="secondary" className="text-xs">
                            score: {typeof item?.score === 'number' ? item.score.toFixed(3) : '-'}
                          </Badge>
                          <span className="truncate text-xs text-muted-foreground">
                            {item?.source_uuid ?? ''}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </ScrollArea>
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}
