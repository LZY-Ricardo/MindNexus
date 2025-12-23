import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useStore } from '@/lib/store'

export default function Settings() {
  const ollamaModel = useStore((s) => s.ollamaModel)
  const setOllamaModel = useStore((s) => s.setOllamaModel)

  return (
    <Card>
      <CardHeader>
        <CardTitle>设置</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="text-sm font-medium">Ollama 模型</div>
          <Input
            value={ollamaModel}
            onChange={(e) => setOllamaModel(e.target.value)}
            placeholder="例如：qwen3:8b"
          />
          <div className="text-xs text-muted-foreground">
            需要本机 Ollama 已存在该模型，例如：
            <span className="font-mono">ollama run {ollamaModel}</span>
          </div>
        </div>

        <div className="text-sm text-muted-foreground">
          v1.0 先把主流程跑通：后续在这里加入数据目录、快捷键等配置项。
        </div>
      </CardContent>
    </Card>
  )
}
