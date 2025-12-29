import { useEffect, useMemo, useState } from 'react'
import { Download, ExternalLink, RefreshCw, Rocket, Terminal, CheckCircle2, AlertCircle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { useStore } from '@/lib/store'

function formatBytes(bytes) {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes <= 0) return '-'
  const mb = bytes / 1024 / 1024
  if (mb < 1024) return `${mb.toFixed(0)} MB`
  return `${(mb / 1024).toFixed(1)} GB`
}

export default function OnboardingPage() {
  const config = useStore((s) => s.config)
  const ollamaStatus = useStore((s) => s.ollamaStatus)
  const checkOllamaStatus = useStore((s) => s.checkOllamaStatus)
  const loadOllamaModels = useStore((s) => s.loadOllamaModels)
  const ollamaModels = useStore((s) => s.ollamaModels)

  const [modelName, setModelName] = useState(() => String(config?.ollamaModel || 'qwen3:8b'))
  const [pulling, setPulling] = useState(false)
  const [pullStatus, setPullStatus] = useState('')
  const [pullProgress, setPullProgress] = useState({ completed: 0, total: 0 })
  const [pullError, setPullError] = useState('')

  const [lastModel, setLastModel] = useState('')

  useEffect(() => {
    void checkOllamaStatus?.()
  }, [checkOllamaStatus])

  useEffect(() => {
    const off = window.api?.on?.('ollama:pull-progress', (data) => {
      if (!data) return
      const model = String(data?.model ?? '').trim()
      if (model && model !== lastModel) return

      const error = data?.error ? String(data.error) : ''
      if (error) setPullError(error)

      if (typeof data?.status === 'string') setPullStatus(data.status)

      const completed =
        typeof data?.completed === 'number' && Number.isFinite(data.completed) ? data.completed : null
      const total = typeof data?.total === 'number' && Number.isFinite(data.total) ? data.total : null
      if (completed != null && total != null) setPullProgress({ completed, total })

      if (data?.done) {
        setPulling(false)
        void checkOllamaStatus?.()
        void loadOllamaModels?.({ force: true })
      }
    })
    return () => off?.()
  }, [checkOllamaStatus, lastModel, loadOllamaModels])

  const quickModels = useMemo(() => ['qwen3:8b', 'deepseek-r1:7b', 'llama3:latest'], [])

  const progressPercent = useMemo(() => {
    const { completed, total } = pullProgress
    if (!total || total <= 0) return 0
    return Math.min(100, Math.max(0, Math.round((completed / total) * 100)))
  }, [pullProgress])

  const openDownload = async () => {
    await window.api.invoke('ollama:open-download')
  }

  const startPull = async () => {
    const name = String(modelName ?? '').trim()
    if (!name || pulling) return

    setPullError('')
    setPullStatus('准备开始…')
    setPullProgress({ completed: 0, total: 0 })
    setPulling(true)
    setLastModel(name)

    const res = await window.api.invoke('ollama:pull-start', { model: name })
    if (!res?.success) {
      setPulling(false)
      setPullError(String(res?.message || '启动拉取失败'))
    }
  }

  const badge = (() => {
    if (ollamaStatus === 'connected') return <Badge className="bg-green-500/10 text-green-600">已连接</Badge>
    if (ollamaStatus === 'checking') return <Badge variant="outline">检测中…</Badge>
    if (ollamaStatus === 'disconnected')
      return <Badge className="bg-orange-500/10 text-orange-600">未连接</Badge>
    return <Badge variant="outline">未知</Badge>
  })()

  return (
    <div className="h-full overflow-auto space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle>新手引导：安装 Ollama 并准备模型</CardTitle>
            <div className="flex items-center gap-2">
              {badge}
              <Button variant="outline" size="sm" onClick={() => void checkOllamaStatus?.()}>
                重新检测
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Download className="h-4 w-4" />
              第一步：下载并安装 Ollama
            </div>
            <div className="text-xs text-muted-foreground">
              下载安装到本机后，应用会通过 <code className="rounded bg-black/10 px-1">http://localhost:11434</code> 与它通信。
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={() => void openDownload()} className="gap-2">
                <ExternalLink className="h-4 w-4" />
                打开 Ollama 官网下载页
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Terminal className="h-4 w-4" />
              第二步：启动 Ollama 服务
            </div>
            <div className="text-xs text-muted-foreground">
              安装完成后执行以下命令（或打开 Ollama 应用）：
            </div>
            <div className="rounded-md border bg-muted/20 px-3 py-2 font-mono text-xs">
              ollama serve
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Rocket className="h-4 w-4" />
              第三步：拉取并准备对话模型
            </div>

            <div className="space-y-2">
              <div className="text-xs text-muted-foreground">模型名称（示例：qwen3:8b、deepseek-r1:7b）</div>
              <div className="flex items-center gap-2">
                <Input value={modelName} onChange={(e) => setModelName(e.target.value)} disabled={pulling} />
                <Button onClick={() => void startPull()} disabled={pulling || !String(modelName).trim()}>
                  {pulling ? (
                    <span className="flex items-center gap-2">
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      拉取中
                    </span>
                  ) : (
                    '开始拉取'
                  )}
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {quickModels.map((m) => (
                  <button
                    key={m}
                    type="button"
                    className="rounded-md border px-2 py-1 text-xs hover:bg-muted"
                    onClick={() => setModelName(m)}
                    disabled={pulling}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            {(pulling || pullStatus || pullError) && (
              <div className="rounded-md border bg-muted/10 p-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-xs text-muted-foreground">当前模型：{lastModel || '-'}</div>
                    <div className="mt-1 flex items-center gap-2">
                      {pullError ? (
                        <AlertCircle className="h-4 w-4 text-destructive" />
                      ) : (
                        <CheckCircle2 className={cn('h-4 w-4', pulling ? 'text-muted-foreground' : 'text-green-600')} />
                      )}
                      <div className={cn('text-sm', pullError && 'text-destructive')}>
                        {pullError || pullStatus || (pulling ? '拉取中…' : '完成')}
                      </div>
                    </div>
                  </div>
                  <div className="text-right text-xs text-muted-foreground">
                    {pullProgress.total > 0 ? `${progressPercent}% · ${formatBytes(pullProgress.total)}` : ''}
                  </div>
                </div>

                {pullProgress.total > 0 && (
                  <div className="mt-3 h-2 w-full overflow-hidden rounded bg-muted">
                    <div className="h-full bg-primary" style={{ width: `${progressPercent}%` }} />
                  </div>
                )}
              </div>
            )}

            <div className="text-xs text-muted-foreground">
              拉取成功后，“设置 / 对话模型”与“对话页顶部模型切换”会自动出现该模型。
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>已检测到的本机模型</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {Array.isArray(ollamaModels) && ollamaModels.length > 0 ? (
            <div className="grid gap-2 md:grid-cols-2">
              {ollamaModels.map((m) => (
                <div key={m.name} className="rounded-md border p-3">
                  <div className="text-sm font-medium">{m.name}</div>
                  <div className="mt-1 text-xs text-muted-foreground">大小：{formatBytes(m.size)}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">暂无模型（或未连接 Ollama）</div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
