import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'

import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'

export default function MessageBubble({ message, sources, isLast, streaming }) {
  const role = message?.role
  const isUser = role === 'user'

  const content = String(message?.content ?? '')
  const displayContent = content || (role === 'assistant' && streaming && isLast ? '...' : '')
  const sourceList = Array.isArray(sources) ? sources : []
  const shouldShowSources = sourceList.length > 0 && content.trim().length > 0

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
                    <Badge key={String(item?.uuid ?? item?.fileName)} variant="secondary">
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
