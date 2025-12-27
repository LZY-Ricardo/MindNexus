import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useStore } from '@/lib/store'

export default function Settings() {
  const config = useStore((s) => s.config)
  const saveConfig = useStore((s) => s.saveConfig)
  const [form, setForm] = useState(config)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setForm(config)
  }, [config])

  const update = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const onSave = async () => {
    setSaving(true)
    try {
      await saveConfig(form)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="h-full overflow-auto space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>模型设置</CardTitle>
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
