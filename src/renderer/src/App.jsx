import { HashRouter, Route, Routes } from 'react-router-dom'
import MainLayout from '@/layouts/MainLayout'
import FloatLayout from '@/layouts/FloatLayout'
import Dashboard from '@/pages/Dashboard'
import ChatPage from '@/pages/ChatPage'
import Settings from '@/pages/Settings'
import FloatPage from '@/pages/FloatPage'
import { Toaster } from '@/components/ui/toaster'

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<MainLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="chat" element={<ChatPage />} />
          <Route path="settings" element={<Settings />} />
        </Route>

        <Route path="/float" element={<FloatLayout />}>
          <Route index element={<FloatPage />} />
        </Route>
      </Routes>

      <Toaster />
    </HashRouter>
  )
}
