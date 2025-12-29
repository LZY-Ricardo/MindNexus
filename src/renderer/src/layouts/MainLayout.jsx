import {
  LayoutDashboard,
  Upload,
  Database,
  MessageSquare,
  Search,
  BarChart3,
  HardDrive,
  Settings,
  Brain,
  Sparkles,
  Moon,
  Sun,
  ChevronLeft,
  ChevronRight,
  Menu,
  Rocket
} from 'lucide-react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useStore } from '@/lib/store'
import { useEffect, useState } from 'react'

function NavItem({ to, children, icon: Icon, collapsed }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all duration-200',
          isActive
            ? 'bg-primary/10 text-primary font-medium'
            : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
          collapsed && 'justify-center px-2'
        )
      }
      end={to === '/'}
      title={collapsed ? children : undefined}
    >
      {Icon && (
        <Icon
          className={cn(
            'h-4 w-4 shrink-0 transition-colors',
            'group-hover:text-foreground'
          )}
        />
      )}
      {!collapsed && <span>{children}</span>}
    </NavLink>
  )
}

function NavGroup({ title, children, collapsed }) {
  return (
    <div className="space-y-1">
      {!collapsed && (
        <p className="px-3 text-xs font-medium text-muted-foreground/70">{title}</p>
      )}
      {children}
    </div>
  )
}

export default function MainLayout() {
  const location = useLocation()
  const sidebarOpen = useStore((s) => s.sidebarOpen)
  const toggleSidebar = useStore((s) => s.toggleSidebar)
  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem('theme')
    const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)')?.matches
    return saved ? saved === 'dark' : Boolean(prefersDark)
  })
  // 新增：折叠状态（大屏支持折叠，小屏仍然是完全隐藏）
  const [collapsed, setCollapsed] = useState(false)

  const title = (() => {
    if (location.pathname === '/chat') return '对话'
    if (location.pathname === '/settings') return '设置'
    if (location.pathname === '/onboarding') return '新手引导'
    if (location.pathname === '/import') return '文件导入'
    if (location.pathname === '/knowledge') return '知识库管理'
    if (location.pathname === '/sessions') return '会话管理'
    if (location.pathname === '/search') return '搜索中心'
    if (location.pathname === '/analytics') return '数据分析'
    if (location.pathname === '/backup') return '备份恢复'
    return '仪表盘'
  })()

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark)
    localStorage.setItem('theme', isDark ? 'dark' : 'light')
  }, [isDark])

  const toggleTheme = () => {
    setIsDark((prev) => !prev)
  }

  return (
    <div className="h-screen w-screen bg-background text-foreground">
      <div className="flex h-full">
        {/* Sidebar */}
        <aside
          className={cn(
            'flex flex-col border-r bg-card/50 transition-all duration-300',
            // 大屏：显示/折叠
            'hidden md:flex',
            collapsed ? 'w-16' : 'w-64',
            // 小屏：通过 sidebarOpen 控制
            !sidebarOpen && 'md:hidden'
          )}
        >
          {/* Header */}
          <div className="flex h-16 items-center justify-between border-b px-4">
            {!collapsed && (
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                  <Brain className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h1 className="text-sm font-semibold tracking-tight">MindNexus</h1>
                  <p className="text-[10px] text-muted-foreground">本地知识库</p>
                </div>
              </div>
            )}
            {collapsed && (
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                <Brain className="h-5 w-5 text-primary" />
              </div>
            )}
            {/* 折叠按钮 */}
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              onClick={() => setCollapsed(!collapsed)}
              aria-label={collapsed ? '展开侧边栏' : '收缩侧边栏'}
            >
              {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </Button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 space-y-6 overflow-y-auto p-4">
            {/* 核心区 */}
            <NavGroup title="核心功能" collapsed={collapsed}>
              <NavItem to="/" icon={LayoutDashboard} collapsed={collapsed}>
                仪表盘
              </NavItem>
              <NavItem to="/chat" icon={MessageSquare} collapsed={collapsed}>
                对话
              </NavItem>
              <NavItem to="/search" icon={Search} collapsed={collapsed}>
                搜索中心
              </NavItem>
            </NavGroup>

            {/* 数据区 */}
            <NavGroup title="知识管理" collapsed={collapsed}>
              <NavItem to="/knowledge" icon={Database} collapsed={collapsed}>
                知识库管理
              </NavItem>
              <NavItem to="/import" icon={Upload} collapsed={collapsed}>
                文件导入
              </NavItem>
              <NavItem to="/sessions" icon={Sparkles} collapsed={collapsed}>
                会话管理
              </NavItem>
              <NavItem to="/analytics" icon={BarChart3} collapsed={collapsed}>
                数据分析
              </NavItem>
            </NavGroup>
          </nav>

          {/* Footer - 系统区 */}
          <div className="border-t p-3">
            <nav className="space-y-1">
              <NavItem to="/backup" icon={HardDrive} collapsed={collapsed}>
                备份恢复
              </NavItem>
              <NavItem to="/onboarding" icon={Rocket} collapsed={collapsed}>
                新手引导
              </NavItem>
              <NavItem to="/settings" icon={Settings} collapsed={collapsed}>
                设置
              </NavItem>
            </nav>
          </div>
        </aside>

        {/* Main Content */}
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-14 items-center justify-between border-b px-4">
            <div className="flex items-center gap-2">
              <Button
                size="icon"
                variant="ghost"
                className="md:hidden"
                onClick={toggleSidebar}
                aria-label="切换侧边栏"
              >
                <Menu className="h-5 w-5" />
              </Button>
              <div className="text-sm text-muted-foreground">{title}</div>
            </div>
            <div className="flex items-center gap-2">
              <Button size="icon" variant="outline" onClick={toggleTheme} aria-label="切换主题">
                {isDark ? <Sun /> : <Moon />}
              </Button>
            </div>
          </header>

          <main
            className={cn(
              'min-h-0 flex-1 overflow-hidden',
              location.pathname === '/chat' ? 'p-0' : 'p-4'
            )}
          >
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  )
}
