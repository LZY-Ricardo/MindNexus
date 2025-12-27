import { useEffect } from 'react'
import { HashRouter, Route, Routes, useNavigate } from 'react-router-dom'
import MainLayout from '@/layouts/MainLayout'
import FloatLayout from '@/layouts/FloatLayout'
import Dashboard from '@/pages/Dashboard'
import ChatPage from '@/pages/ChatPage'
import Settings from '@/pages/Settings'
import FloatPage from '@/pages/FloatPage'
import ImportPage from '@/pages/ImportPage'
import KnowledgePage from '@/pages/KnowledgePage'
import SessionsPage from '@/pages/SessionsPage'
import SearchPage from '@/pages/SearchPage'
import AnalyticsPage from '@/pages/AnalyticsPage'
import BackupPage from '@/pages/BackupPage'
import { Toaster } from '@/components/ui/toaster'
import { useStore } from '@/lib/store'

function NavigateListener() {
  const navigate = useNavigate()
  const loadConfig = useStore((s) => s.loadConfig)

  useEffect(() => {
    void loadConfig?.()
  }, [loadConfig])

  useEffect(() => {
    const off = window.api?.on?.('app:navigate', (data) => {
      const path = typeof data === 'string' ? data : data?.path
      if (path) navigate(path)
    })
    return () => off?.()
  }, [navigate])

  return null
}

export default function App() {
  return (
    <HashRouter>
      <NavigateListener />
      <Routes>
        <Route path="/" element={<MainLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="chat" element={<ChatPage />} />
          <Route path="settings" element={<Settings />} />
          <Route path="import" element={<ImportPage />} />
          <Route path="knowledge" element={<KnowledgePage />} />
          <Route path="sessions" element={<SessionsPage />} />
          <Route path="search" element={<SearchPage />} />
          <Route path="analytics" element={<AnalyticsPage />} />
          <Route path="backup" element={<BackupPage />} />
        </Route>

        <Route path="/float" element={<FloatLayout />}>
          <Route index element={<FloatPage />} />
        </Route>
      </Routes>

      <Toaster />
    </HashRouter>
  )
}
