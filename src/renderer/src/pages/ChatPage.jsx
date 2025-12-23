import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function ChatPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>对话</CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        Phase 4 Part 1：先跑通 UI 框架与 IPC 链路，后续再补齐 Chat 交互与消息流。
      </CardContent>
    </Card>
  )
}
