import { useCallback, useEffect, useRef, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Input } from '@/components/ui/input'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

const ACCEPTED_EXTS = ['.pdf', '.docx', '.md', '.txt']
const ACCEPT_ATTR = ACCEPTED_EXTS.join(',')

function getFileName(filePath) {
  if (!filePath) return '未命名文件'
  const parts = String(filePath).split(/[\\/]/)
  return parts[parts.length - 1] || '未命名文件'
}

function getFileExt(name) {
  const value = String(name || '')
  const idx = value.lastIndexOf('.')
  if (idx === -1) return ''
  return value.slice(idx).toLowerCase()
}

function toStatus(stage) {
  if (stage === 'done') return { label: '完成', variant: 'secondary' }
  if (stage === 'error') return { label: '失败', variant: 'destructive' }
  return { label: '处理中', variant: 'outline' }
}

export default function ImportPage() {
  const inputRef = useRef(null)
  const [dragging, setDragging] = useState(false)
  const [importing, setImporting] = useState(false)
  const [imports, setImports] = useState([])
  const [knowledgeBases, setKnowledgeBases] = useState([])
  const [kbId, setKbId] = useState('default')
  const [tagsInput, setTagsInput] = useState('')

  const upsertImport = useCallback((entry) => {
    if (!entry?.id) return
    setImports((prev) => {
      const next = [...prev]
      const index = next.findIndex((item) => item.id === entry.id)
      if (index === -1) {
        next.unshift(entry)
      } else {
        next[index] = { ...next[index], ...entry }
      }
      return next.slice(0, 6)
    })
  }, [])

  useEffect(() => {
    if (!window.api?.on) return undefined
    return window.api.on('file:process-progress', (progress) => {
      const name = getFileName(progress?.filePath)
      const stage = String(progress?.stage ?? 'processing')
      upsertImport({
        id: progress?.uuid,
        uuid: progress?.uuid,
        name,
        stage,
        message: progress?.message ? String(progress.message) : '',
        progress: Number(progress?.progress ?? 0)
      })
    })
  }, [upsertImport])

  useEffect(() => {
    const loadKbs = async () => {
      try {
        const list = await window.api.invoke('kb:list')
        setKnowledgeBases(Array.isArray(list) ? list : [])
        const defaultKb = list?.find?.((kb) => kb?.is_default)
        if (defaultKb?.id) setKbId(defaultKb.id)
      } catch {
        setKnowledgeBases([])
      }
    }
    void loadKbs()
  }, [])

  const importFile = useCallback(
    async (file) => {
      if (!file) return
      const name = file?.name || '未命名文件'
      const ext = getFileExt(name)
      if (ext && !ACCEPTED_EXTS.includes(ext)) {
        const id = `local-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
        upsertImport({
          id,
          name,
          stage: 'error',
          progress: 100,
          message: `不支持的文件类型: ${ext}`
        })
        toast({ variant: 'destructive', title: '导入失败', description: `${name} 不支持该类型` })
        return
      }

      try {
        const payload = file.path
          ? file.path
          : {
              fileName: name,
              data: new Uint8Array(await file.arrayBuffer())
            }
        const tags = tagsInput
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean)
        const res = await window.api?.processFile?.({
          ...(typeof payload === 'string' ? { filePath: payload } : payload),
          kbId,
          tags
        })
        if (res?.success === false) {
          throw new Error(res?.message || '导入失败')
        }
        toast({ title: '导入完成', description: name })
      } catch (error) {
        const msg = String(error?.message || error)
        const id = `local-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
        upsertImport({
          id,
          name,
          stage: 'error',
          progress: 100,
          message: msg
        })
        toast({ variant: 'destructive', title: '导入失败', description: msg })
      }
    },
    [kbId, tagsInput, upsertImport]
  )

  const handleFiles = useCallback(
    async (fileList) => {
      const files = Array.from(fileList || [])
      if (files.length === 0) return
      setImporting(true)
      try {
        for (const file of files) {
          await importFile(file)
        }
      } finally {
        setImporting(false)
      }
    },
    [importFile]
  )

  const handleSelect = (event) => {
    void handleFiles(event.target.files)
    event.target.value = ''
  }

  const handleDrop = (event) => {
    event.preventDefault()
    setDragging(false)
    void handleFiles(event.dataTransfer.files)
  }

  return (
    <div className="h-full overflow-auto">
      <Card>
        <CardHeader>
          <CardTitle>文件导入</CardTitle>
          <CardDescription>支持 PDF / DOCX / MD / TXT，导入后会自动建立索引。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <div className="text-sm font-medium">目标知识库</div>
              <select
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                value={kbId}
                onChange={(e) => setKbId(e.target.value)}
              >
                {knowledgeBases.length === 0 && <option value="default">默认知识库</option>}
                {knowledgeBases.map((kb) => (
                  <option key={kb.id} value={kb.id}>
                    {kb.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <div className="text-sm font-medium">标签（逗号分隔）</div>
              <Input
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="例如：项目A, 会议纪要"
              />
            </div>
          </div>
          <div
            className={cn(
              'flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed px-6 py-10 text-sm transition',
              dragging
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-muted-foreground/30 bg-muted/40 text-muted-foreground'
            )}
            style={{ WebkitAppRegion: 'no-drag' }}
            onDragOver={(event) => {
              event.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
          >
            <div className="text-base font-medium text-foreground">拖拽文件到此处</div>
            <div>或点击按钮选择文件</div>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept={ACCEPT_ATTR}
              className="hidden"
              onChange={handleSelect}
            />
            <Button
              type="button"
              variant="outline"
              disabled={importing}
              onClick={() => inputRef.current?.click()}
            >
              {importing ? '导入中...' : '选择文件'}
            </Button>
          </div>

          <div className="space-y-3">
            <div className="text-sm font-medium">导入进度</div>
            {imports.length === 0 ? (
              <div className="rounded-lg border border-dashed px-4 py-6 text-sm text-muted-foreground">
                暂无导入任务
              </div>
            ) : (
              imports.map((item) => {
                const status = toStatus(item.stage)
                return (
                  <div key={item.id} className="rounded-lg border px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="truncate text-sm font-medium">{item.name}</div>
                      <Badge variant={status.variant}>{status.label}</Badge>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                      <span className="truncate">
                        {item.message || (status.label === '处理中' ? '处理中...' : '完成')}
                      </span>
                      <span>{Math.min(100, Math.max(0, Number(item.progress || 0)))}%</span>
                    </div>
                    <Progress className="mt-2" value={Number(item.progress || 0)} />
                  </div>
                )
              })
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
