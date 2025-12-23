import { Moon, Sun } from 'lucide-react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useStore } from '@/lib/store'
import { useEffect, useState } from 'react'

function NavItem({ to, children }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          'flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors',
          isActive ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent/50'
        )
      }
      end={to === '/'}
    >
      {children}
    </NavLink>
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

  const title = (() => {
    if (location.pathname === '/chat') return '对话'
    if (location.pathname === '/settings') return '设置'
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
        <aside
          className={cn('w-64 shrink-0 border-r p-4', sidebarOpen ? 'block' : 'hidden', 'md:block')}
        >
          <div className="mb-4 text-lg font-semibold">MindNexus</div>
          <nav className="space-y-1">
            <NavItem to="/">仪表盘</NavItem>
            <NavItem to="/chat">对话</NavItem>
            <NavItem to="/settings">设置</NavItem>
            <NavItem to="/float">悬浮窗（测试）</NavItem>
          </nav>
        </aside>

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
                <span className="text-lg leading-none">≡</span>
              </Button>
              <div className="text-sm text-muted-foreground">{title}</div>
            </div>
            <div className="flex items-center gap-2">
              <Button size="icon" variant="outline" onClick={toggleTheme} aria-label="切换主题">
                {isDark ? <Sun /> : <Moon />}
              </Button>
            </div>
          </header>

          <main className="min-h-0 flex-1 overflow-hidden p-4">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  )
}
