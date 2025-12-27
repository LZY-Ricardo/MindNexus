import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'

import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

export default function MessageBubble({ message, sources, isLast, streaming }) {
  const role = message?.role
  const isUser = role === 'user'

  const content = String(message?.content ?? '')
  const displayContent = content || (role === 'assistant' && streaming && isLast ? '...' : '')
  const sourceList = Array.isArray(sources) ? sources : []

  // 检测回答是否表示"不知道"或无相关内容，这种情况下不应显示来源
  const isNoAnswerResponse = (() => {
    const lowerContent = content.toLowerCase()
    const noAnswerPatterns = [
      "i don't know",
      "i do not know",
      "没有找到",
      "暂时没有找到",
      "无法回答",
      "不确定",
      "没有相关",
      "没有足够的信息",
      "无法确定"
    ]
    return noAnswerPatterns.some(pattern => lowerContent.includes(pattern))
  })()

  const shouldShowSources = sourceList.length > 0 && content.trim().length > 0 && !isNoAnswerResponse

  const openSource = async (source) => {
    const uuid = String(source?.uuid ?? '').trim()
    if (!uuid) return

    const pending = toast({ title: '正在打开文件...' })
    try {
      const ok = await window.api.invoke('file:open', { uuid })
      pending.dismiss()
      if (!ok) {
        toast({ variant: 'destructive', title: '打开失败', description: '无法打开该文件' })
      }
    } catch (error) {
      pending.dismiss()
      toast({
        variant: 'destructive',
        title: '打开失败',
        description: String(error?.message || error)
      })
    }
  }

  return (
    <div className={cn('flex', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[80%] rounded-lg px-3 py-2 text-sm leading-6',
          isUser ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'
        )}
      >
        {isUser ? (
          <div className="whitespace-pre-wrap">{displayContent}</div>
        ) : (
          <div>
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
                {displayContent}
              </ReactMarkdown>
            </div>

            {shouldShowSources && (
              <div className="mt-3">
                <Separator />
                <div className="mt-3 text-xs text-muted-foreground">参考来源:</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {sourceList.map((item) => (
                    <Badge
                      key={String(item?.uuid ?? item?.fileName)}
                      variant="secondary"
                      className="cursor-pointer hover:bg-secondary/80"
                      onClick={() => openSource(item)}
                    >
                      {String(item?.fileName ?? item?.uuid ?? '')}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
