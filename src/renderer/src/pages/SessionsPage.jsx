import { useCallback, useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search,
  Check,
  ChevronDown,
  Trash2,
  RefreshCw,
  FolderOpen,
  Calendar,
  MessageSquare
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { useStore } from '@/lib/store'
import { cn } from '@/lib/utils'
import { toast } from '@/hooks/use-toast'

// 格式化时间显示
function formatTime(timestamp) {
  if (!timestamp) return '-'
  const date = new Date(timestamp * 1000)
  if (Number.isNaN(date.getTime())) return '-'

  const now = new Date()
  const diffMs = now - date
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) {
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  } else if (diffDays === 1) {
    return '昨天 ' + date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  } else if (diffDays < 7) {
    const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
    return weekdays[date.getDay()] + ' ' + date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  } else {
    return date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
  }
}

// 排序选项
const sortOptions = [
  { value: 'updated-desc', label: '最新更新' },
  { value: 'updated-asc', label: '最早更新' },
  { value: 'created-desc', label: '最新创建' },
  { value: 'created-asc', label: '最早创建' },
  { value: 'messages-desc', label: '消息数量（多→少）' },
  { value: 'messages-asc', label: '消息数量（少→多）' },
  { value: 'title-asc', label: '标题（A→Z）' },
  { value: 'title-desc', label: '标题（Z→A）' }
]

export default function SessionsPage() {
  const navigate = useNavigate()
  const setCurrentSessionId = useStore((s) => s.setCurrentSessionId)

  const [sessions, setSessions] = useState([])
  const [knowledgeBases, setKnowledgeBases] = useState([])

  // 搜索和过滤状态
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [sortBy, setSortBy] = useState('updated-desc')
  const [filterKbId, setFilterKbId] = useState('all')
  const [filterHasMessages, setFilterHasMessages] = useState('all')

  // 对话框状态
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [sessionToDelete, setSessionToDelete] = useState(null)

  const load = useCallback(async () => {
    const list = await window.api.invoke('session:list')
    setSessions(Array.isArray(list) ? list : [])
  }, [])

  const loadKnowledgeBases = useCallback(async () => {
    const list = await window.api.invoke('kb:list')
    setKnowledgeBases(Array.isArray(list) ? list : [])
  }, [])

  useEffect(() => {
    void load()
    void loadKnowledgeBases()
  }, [load, loadKnowledgeBases])

  // 知识库名称映射
  const kbName = (id) => {
    const item = knowledgeBases.find((kb) => kb.id === id)
    return item?.name || id || '-'
  }

  // 打开会话
  const openSession = (id) => {
    setCurrentSessionId(id)
    navigate('/chat')
  }

  // 重命名会话
  const renameSession = async (session) => {
    const nextTitle = window.prompt('请输入新会话名称', session.title)
    if (!nextTitle) return
    await window.api.invoke('session:update', { id: session.id, title: nextTitle, model: session.model })
    await load()
  }

  // 删除单个会话
  const confirmDelete = (session) => {
    setSessionToDelete(session)
    setDeleteDialogOpen(true)
  }

  const executeDelete = async () => {
    if (!sessionToDelete?.id) return

    try {
      await window.api.invoke('session:delete', { id: sessionToDelete.id })
      toast({
        title: '删除成功',
        description: `"${sessionToDelete.title}" 已删除`
      })
      await load()
    } catch (error) {
      toast({
        variant: 'destructive',
        title: '删除失败',
        description: String(error)
      })
    } finally {
      setDeleteDialogOpen(false)
      setSessionToDelete(null)
    }
  }

  // 批量删除选中会话
  const batchDelete = async () => {
    if (selectedIds.size === 0) return

    const ok = window.confirm(`确认删除选中的 ${selectedIds.size} 个会话及其消息？`)
    if (!ok) return

    try {
      for (const id of selectedIds) {
        await window.api.invoke('session:delete', { id })
      }
      toast({
        title: '批量删除成功',
        description: `已删除 ${selectedIds.size} 个会话`
      })
      setSelectedIds(new Set())
      await load()
    } catch (error) {
      toast({
        variant: 'destructive',
        title: '批量删除失败',
        description: String(error)
      })
    }
  }

  // 全选/取消全选
  const toggleSelectAll = () => {
    if (selectedIds.size === filteredSessions.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filteredSessions.map((s) => s.id)))
    }
  }

  // 切换单个选中状态
  const toggleSelect = (id) => {
    const newSelected = new Set(selectedIds)
    if (newSelected.has(id)) {
      newSelected.delete(id)
    } else {
      newSelected.add(id)
    }
    setSelectedIds(newSelected)
  }

  // 过滤和排序后的会话列表
  const filteredSessions = useMemo(() => {
    let result = [...sessions]

    // 搜索过滤
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim()
      result = result.filter((s) =>
        String(s.title ?? '').toLowerCase().includes(query)
      )
    }

    // 知识库过滤
    if (filterKbId !== 'all') {
      result = result.filter((s) => s.kb_id === filterKbId)
    }

    // 消息数量过滤
    if (filterHasMessages === 'yes') {
      result = result.filter((s) => (s.message_count || 0) > 0)
    } else if (filterHasMessages === 'no') {
      result = result.filter((s) => (s.message_count || 0) === 0)
    }

    // 排序
    result.sort((a, b) => {
      const [field, order] = sortBy.split('-')
      const multiplier = order === 'asc' ? 1 : -1

      switch (field) {
        case 'updated':
          return (a.updated_at - b.updated_at) * multiplier
        case 'created':
          return (a.created_at - b.created_at) * multiplier
        case 'messages':
          return ((a.message_count || 0) - (b.message_count || 0)) * multiplier
        case 'title':
          return String(a.title ?? '').localeCompare(String(b.title ?? '')) * multiplier
        default:
          return 0
      }
    })

    return result
  }, [sessions, searchQuery, filterKbId, filterHasMessages, sortBy])

  // 全选状态
  const isAllSelected = filteredSessions.length > 0 && selectedIds.size === filteredSessions.length
  const isIndeterminate = selectedIds.size > 0 && selectedIds.size < filteredSessions.length

  return (
    <div className="flex h-full flex-col">
      {/* 工具栏 */}
      <div className="flex flex-wrap items-center gap-3 border-b px-6 py-4">
        {/* 搜索框 */}
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="搜索会话标题..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* 过滤器 */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1">
              知识库
              <ChevronDown className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            <DropdownMenuCheckboxItem
              checked={filterKbId === 'all'}
              onCheckedChange={() => setFilterKbId('all')}
            >
              全部知识库
            </DropdownMenuCheckboxItem>
            <DropdownMenuSeparator />
            {knowledgeBases.map((kb) => (
              <DropdownMenuCheckboxItem
                key={kb.id}
                checked={filterKbId === kb.id}
                onCheckedChange={() => setFilterKbId(kb.id)}
              >
                {kb.name}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1">
              消息状态
              <ChevronDown className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-40">
            <DropdownMenuCheckboxItem
              checked={filterHasMessages === 'all'}
              onCheckedChange={() => setFilterHasMessages('all')}
            >
              全部
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={filterHasMessages === 'yes'}
              onCheckedChange={() => setFilterHasMessages('yes')}
            >
              有消息
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={filterHasMessages === 'no'}
              onCheckedChange={() => setFilterHasMessages('no')}
            >
              无消息
            </DropdownMenuCheckboxItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* 排序 */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1">
              排序
              <ChevronDown className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            {sortOptions.map((option) => (
              <DropdownMenuCheckboxItem
                key={option.value}
                checked={sortBy === option.value}
                onCheckedChange={() => setSortBy(option.value)}
              >
                {option.label}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* 批量操作 */}
        {selectedIds.size > 0 && (
          <Button variant="destructive" size="sm" onClick={batchDelete} className="gap-1">
            <Trash2 className="h-3.5 w-3.5" />
            删除 ({selectedIds.size})
          </Button>
        )}

        {/* 刷新 */}
        <Button variant="outline" size="sm" onClick={load} className="gap-1">
          <RefreshCw className={cn('h-3.5 w-3.5', 'opacity-50')} />
        </Button>
      </div>

      {/* 统计信息 */}
      <div className="border-b px-6 py-2 text-xs text-muted-foreground">
        共 {filteredSessions.length} 个会话
        {searchQuery && ` · 搜索结果`}
        {filterKbId !== 'all' && ` · 知识库: ${kbName(filterKbId)}`}
      </div>

      {/* 会话列表 */}
      <ScrollArea className="min-h-0 flex-1">
        <div className="px-6 py-4">
          {filteredSessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <MessageSquare className="mb-4 h-12 w-12 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">
                {searchQuery || filterKbId !== 'all' || filterHasMessages !== 'all'
                  ? '没有找到匹配的会话'
                  : '暂无会话'}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {/* 全选行 */}
              <div className="flex items-center gap-3 px-3 py-2 text-sm font-medium text-muted-foreground">
                <button
                  type="button"
                  onClick={toggleSelectAll}
                  className="flex h-5 w-5 items-center justify-center rounded border border-primary/20 hover:bg-primary/5 transition-colors"
                >
                  {isAllSelected ? (
                    <Check className="h-3.5 w-3.5 text-primary" />
                  ) : isIndeterminate ? (
                    <div className="h-2.5 w-2.5 rounded-sm bg-primary/60" />
                  ) : null}
                </button>
                <span>{isAllSelected ? '取消全选' : '全选'}</span>
                {selectedIds.size > 0 && (
                  <span className="text-primary">
                    已选 {selectedIds.size} 项
                  </span>
                )}
              </div>

              {/* 会话列表 */}
              {filteredSessions.map((session) => {
                const isSelected = selectedIds.has(session.id)
                return (
                  <div
                    key={session.id}
                    className={cn(
                      'group flex items-center gap-3 rounded-lg border px-4 py-3 transition-all',
                      isSelected && 'bg-primary/5 border-primary/20'
                    )}
                  >
                    {/* 复选框 */}
                    <button
                      type="button"
                      onClick={() => toggleSelect(session.id)}
                      className={cn(
                        'flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors',
                        'hover:border-primary/50 hover:bg-primary/5',
                        isSelected && 'bg-primary border-primary'
                      )}
                    >
                      {isSelected && <Check className="h-3.5 w-3.5 text-primary-foreground" />}
                    </button>

                    {/* 会话信息 */}
                    <div
                      className="min-w-0 flex-1 cursor-pointer"
                      onClick={() => openSession(session.id)}
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">{session.title || '未命名会话'}</span>
                        <Badge variant="secondary" className="text-xs">
                          {session.message_count || 0} 条
                        </Badge>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <FolderOpen className="h-3 w-3" />
                          {kbName(session.kb_id)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {formatTime(session.updated_at)}
                        </span>
                      </div>
                    </div>

                    {/* 操作按钮 */}
                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button size="sm" variant="outline" onClick={() => openSession(session.id)}>
                        打开
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => renameSession(session)}>
                        重命名
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => confirmDelete(session)}
                      >
                        删除
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </ScrollArea>

      {/* 删除确认对话框 */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
            <DialogDescription>
              确定要删除会话 <span className="font-medium text-foreground">"{sessionToDelete?.title}"</span> 吗？
              此操作将同时删除该会话下的所有消息，且无法恢复。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              取消
            </Button>
            <Button variant="destructive" onClick={executeDelete}>
              确认删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
