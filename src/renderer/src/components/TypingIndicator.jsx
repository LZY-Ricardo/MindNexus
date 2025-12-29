import { cn } from '@/lib/utils'

export function TypingIndicator({ className }) {
  return (
    <div className={cn('flex items-center gap-1', className)}>
      <span
        className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/60"
        style={{ animationDelay: '0ms' }}
      />
      <span
        className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/60"
        style={{ animationDelay: '150ms' }}
      />
      <span
        className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/60"
        style={{ animationDelay: '300ms' }}
      />
    </div>
  )
}

export function StreamingIndicator({ className }) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className="relative flex h-4 w-4 items-center justify-center">
        <span className="absolute h-full w-full animate-ping rounded-full bg-primary/20" />
        <span className="relative h-2 w-2 rounded-full bg-primary" />
      </div>
      <span className="text-xs text-muted-foreground">AI 正在思考...</span>
    </div>
  )
}
