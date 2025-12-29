import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useStore } from '@/lib/store'

function StatusBadge({ status }) {
  if (status === 'checking') {
    return <Badge variant="outline">检测中…</Badge>
  }
  if (status === 'connected') {
    return (
      <Badge variant="secondary" className="bg-green-500/10 text-green-600 hover:bg-green-500/20">
        已连接
      </Badge>
    )
  }
  if (status === 'disconnected') {
    return (
      <Badge variant="destructive" className="bg-orange-500/10 text-orange-600 hover:bg-orange-500/20">
        未连接
      </Badge>
    )
  }
  return <Badge variant="outline">未知</Badge>
}

export default function Settings() {
  const config = useStore((s) => s.config)
  const saveConfig = useStore((s) => s.saveConfig)
  const ollamaStatus = useStore((s) => s.ollamaStatus)
  const ollamaModels = useStore((s) => s.ollamaModels)
  const ollamaModelsStatus = useStore((s) => s.ollamaModelsStatus)
  const loadOllamaModels = useStore((s) => s.loadOllamaModels)
  const [form, setForm] = useState(config)
  const [saving, setSaving] = useState(false)
  const [initialized, setInitialized] = useState(false)
  const [chatModelMode, setChatModelMode] = useState('select') // 'select' | 'custom'
  const navigate = useNavigate()

  useEffect(() => {
    setForm(config)
  }, [config])

  useEffect(() => {
    if (!initialized) {
      setInitialized(true)
      void useStore.getState().checkOllamaStatus()
    }
  }, [initialized])

  useEffect(() => {
    if (!initialized) return
    if (ollamaStatus !== 'connected') return
    if (ollamaModelsStatus !== 'idle') return
    void loadOllamaModels()
  }, [initialized, loadOllamaModels, ollamaModelsStatus, ollamaStatus])

  const handleCheckConnection = async () => {
    console.log('[Settings] 检测连接按钮被点击')
    console.log('[Settings] window.api 存在:', !!window.api)
    console.log('[Settings] window.api.invoke 存在:', !!window.api?.invoke)
    try {
      const result = await useStore.getState().checkOllamaStatus()
      console.log('[Settings] 检测结果:', result)
    } catch (error) {
      console.error('[Settings] 检测出错:', error)
    }
  }

  const update = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const onSave = async () => {
    setSaving(true)
    try {
      await saveConfig(form)
      // 保存后重新检测连接状态
      await handleCheckConnection()
    } finally {
      setSaving(false)
    }
  }

  const statusText = {
    connected: 'Ollama 服务运行正常',
    disconnected: '无法连接到 Ollama 服务，请确保 Ollama 正在运行',
    checking: '正在检测 Ollama 连接状态…',
    unknown: '尚未检测 Ollama 连接状态'
  }

  const selectChatModel = (name) => {
    const next = String(name ?? '').trim()
    if (!next) return
    update('ollamaModel', next)
  }

  const chatModelInList = useMemo(() => {
    const current = String(form.ollamaModel || '').trim()
    if (!current) return false
    return ollamaModels.some((m) => m?.name === current)
  }, [form.ollamaModel, ollamaModels])

  useEffect(() => {
    if (ollamaStatus !== 'connected') return
    if (ollamaModels.length === 0) return
    if (form.ollamaModel && !chatModelInList) {
      setChatModelMode('custom')
      return
    }
    if (chatModelMode !== 'custom') setChatModelMode('select')
  }, [chatModelInList, chatModelMode, form.ollamaModel, ollamaModels.length, ollamaStatus])

  const formatSize = (bytes) => {
    const value = typeof bytes === 'number' && Number.isFinite(bytes) ? bytes : null
    if (value == null || value <= 0) return '-'
    const mb = value / 1024 / 1024
    if (mb < 1024) return `${mb.toFixed(0)} MB`
    const gb = mb / 1024
    return `${gb.toFixed(1)} GB`
  }

  return (
    <div className="h-full overflow-auto space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>模型设置</CardTitle>
            <div className="flex items-center gap-3">
              <Button variant="outline" size="sm" onClick={() => navigate('/onboarding')}>
                新手引导
              </Button>
              <StatusBadge status={ollamaStatus} />
              <Button variant="outline" size="sm" onClick={handleCheckConnection}>
                检测连接
              </Button>
            </div>
          </div>
          {ollamaStatus === 'disconnected' && (
            <div className="mt-2 rounded-md bg-orange-500/10 p-3 text-sm text-orange-600">
              {statusText.disconnected}
              <br />
              <span className="text-xs opacity-80">
                提示：运行 <code className="rounded bg-black/10 px-1">ollama serve</code> 启动服务
              </span>
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="text-sm font-medium">Ollama 地址</div>
            <Input
              value={form.ollamaUrl || ''}
              onChange={(e) => update('ollamaUrl', e.target.value)}
              placeholder="http://localhost:11434"
            />
          </div>
          <div className="space-y-2">
            <div className="text-sm font-medium">对话模型</div>
            {ollamaStatus === 'connected' && ollamaModels.length > 0 && chatModelMode === 'select' ? (
              <select
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                value={chatModelInList ? form.ollamaModel || '' : ''}
                onChange={(e) => {
                  const value = String(e.target.value || '').trim()
                  if (!value) return
                  selectChatModel(value)
                }}
              >
                {ollamaModels.map((m) => (
                  <option key={m.name} value={m.name}>
                    {m.name}
                  </option>
                ))}
              </select>
            ) : (
              <>
                <Input
                  value={form.ollamaModel || ''}
                  onChange={(e) => update('ollamaModel', e.target.value)}
                  list="ollama-chat-models"
                  placeholder="例如：qwen3:8b"
                />
                <datalist id="ollama-chat-models">
                  {ollamaModels.map((m) => (
                    <option key={m.name} value={m.name} />
                  ))}
                </datalist>
              </>
            )}
            <div className="text-xs text-muted-foreground">
              {ollamaStatus === 'connected' && ollamaModels.length > 0 ? (
                <button
                  type="button"
                  className="underline decoration-muted-foreground/30 underline-offset-2 hover:decoration-muted-foreground"
                  onClick={() => setChatModelMode((m) => (m === 'select' ? 'custom' : 'select'))}
                >
                  {chatModelMode === 'select' ? '切换为自定义输入' : '切换为列表选择'}
                </button>
              ) : (
                '支持手动输入；连接 Ollama 后可从已安装模型中选择'
              )}
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium">已安装模型（来自 Ollama）</div>
              <Button
                variant="outline"
                size="sm"
                disabled={ollamaStatus !== 'connected' || ollamaModelsStatus === 'loading'}
                onClick={() => void loadOllamaModels({ force: true })}
              >
                {ollamaModelsStatus === 'loading' ? '刷新中…' : '刷新列表'}
              </Button>
            </div>
            {ollamaStatus !== 'connected' ? (
              <div className="text-xs text-muted-foreground">连接 Ollama 后可读取本机已下载模型列表</div>
            ) : ollamaModels.length === 0 ? (
              <div className="text-xs text-muted-foreground">
                {ollamaModelsStatus === 'loading' ? '正在读取模型列表…' : '未读取到模型（请确认 Ollama 中已下载模型）'}
              </div>
            ) : (
              <>
                <div className="flex flex-wrap gap-2">
                  {ollamaModels.slice(0, 12).map((m) => (
                    <button
                      key={m.name}
                      type="button"
                      onClick={() => selectChatModel(m.name)}
                      className="rounded-md border px-2 py-1 text-xs hover:bg-muted"
                      title={`${m.name}${m.size ? ` · ${formatSize(m.size)}` : ''}`}
                    >
                      {m.name}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          <div className="space-y-2">
            <div className="text-sm font-medium">Embedding 后端</div>
            <select
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              value={form.embeddingsBackend || 'ollama'}
              onChange={(e) => update('embeddingsBackend', e.target.value)}
            >
              <option value="ollama">ollama</option>
              <option value="transformers">transformers</option>
              <option value="auto">auto</option>
            </select>
          </div>
          <div className="space-y-2">
            <div className="text-sm font-medium">Embedding 模型</div>
            <Input
              value={form.embeddingsModel || ''}
              onChange={(e) => update('embeddingsModel', e.target.value)}
              placeholder="例如：nomic-embed-text:latest"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>搜索与会话</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="text-sm font-medium">默认搜索模式</div>
            <select
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              value={form.defaultSearchMode || 'hybrid'}
              onChange={(e) => update('defaultSearchMode', e.target.value)}
            >
              <option value="semantic">语义</option>
              <option value="keyword">关键词</option>
              <option value="hybrid">混合</option>
            </select>
          </div>
          <div className="space-y-2">
            <div className="text-sm font-medium">会话历史限制</div>
            <Input
              type="number"
              value={form.sessionHistoryLimit || 50}
              onChange={(e) => update('sessionHistoryLimit', Number(e.target.value))}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>备份设置</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between text-sm">
            <span>启用自动备份</span>
            <input
              type="checkbox"
              checked={Boolean(form.autoBackup)}
              onChange={(e) => update('autoBackup', e.target.checked)}
            />
          </div>
          <div className="space-y-2">
            <div className="text-sm font-medium">备份间隔（秒）</div>
            <Input
              type="number"
              value={form.autoBackupInterval || 86400}
              onChange={(e) => update('autoBackupInterval', Number(e.target.value))}
            />
          </div>
          <div className="space-y-2">
            <div className="text-sm font-medium">保留份数</div>
            <Input
              type="number"
              value={form.autoBackupCount || 7}
              onChange={(e) => update('autoBackupCount', Number(e.target.value))}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={onSave} disabled={saving}>
          {saving ? '保存中…' : '保存设置'}
        </Button>
      </div>
    </div>
  )
}
