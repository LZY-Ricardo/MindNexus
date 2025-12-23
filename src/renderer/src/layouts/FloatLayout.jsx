import { useEffect } from 'react'
import { Outlet } from 'react-router-dom'

export default function FloatLayout() {
  useEffect(() => {
    document.documentElement.classList.add('float-window')
    return () => document.documentElement.classList.remove('float-window')
  }, [])

  return (
    <div className="min-h-screen w-screen bg-transparent p-4">
      <Outlet />
    </div>
  )
}
