import { useEffect, useState } from 'react'
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
  const [form, setForm] = useState(config)
  const [saving, setSaving] = useState(false)
  const [initialized, setInitialized] = useState(false)

  useEffect(() => {
    setForm(config)
  }, [config])

  useEffect(() => {
    if (!initialized) {
      setInitialized(true)
      void useStore.getState().checkOllamaStatus()
    }
  }, [initialized])

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

  return (
    <div className="h-full overflow-auto space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>模型设置</CardTitle>
            <div className="flex items-center gap-3">
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
            <Input
              value={form.ollamaModel || ''}
              onChange={(e) => update('ollamaModel', e.target.value)}
              placeholder="例如：qwen3:8b"
            />
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
