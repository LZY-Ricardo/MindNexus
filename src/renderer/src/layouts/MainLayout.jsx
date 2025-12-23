import { NavLink, Outlet } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

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
  return (
    <div className="h-screen w-screen bg-background text-foreground">
      <div className="flex h-full">
        <aside className="w-64 shrink-0 border-r p-4">
          <div className="mb-4 text-lg font-semibold">MindNexus</div>
          <nav className="space-y-1">
            <NavItem to="/">概览</NavItem>
            <NavItem to="/chat">对话</NavItem>
            <NavItem to="/float">悬浮窗（测试）</NavItem>
          </nav>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-14 items-center justify-between border-b px-4">
            <div className="text-sm text-muted-foreground">Dashboard</div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => window.api?.toggleFloat?.()}>
                切换悬浮窗
              </Button>
            </div>
          </header>

          <main className="flex-1 overflow-auto p-4">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  )
}
