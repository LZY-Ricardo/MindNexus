import { useRef } from 'react'
import { Brain } from 'lucide-react'

const CLICK_MAX_DURATION_MS = 200
const CLICK_MAX_DISTANCE_PX = 5

export default function FloatPage() {
  const pointerRef = useRef({ time: 0, x: 0, y: 0 })

  const handleMouseDown = (event) => {
    if (event.button !== 0) return
    pointerRef.current = { time: Date.now(), x: event.clientX, y: event.clientY }
  }

  const handleMouseUp = (event) => {
    if (event.button !== 0) return

    const deltaTime = Date.now() - pointerRef.current.time
    const deltaX = Math.abs(event.clientX - pointerRef.current.x)
    const deltaY = Math.abs(event.clientY - pointerRef.current.y)

    const isClick =
      deltaTime < CLICK_MAX_DURATION_MS &&
      deltaX < CLICK_MAX_DISTANCE_PX &&
      deltaY < CLICK_MAX_DISTANCE_PX
    if (!isClick) return

    window.api?.invoke?.('win:open-main')
  }

  const handleContextMenu = (event) => {
    event.preventDefault()
    window.api?.invoke?.('win:float-context-menu')
  }

  return (
    <div className="h-screen w-screen bg-transparent flex items-center justify-center">
      <div
        className="w-[50px] h-[50px] rounded-full bg-blue-600 flex items-center justify-center shadow-lg text-white hover:bg-blue-500 transition-colors cursor-pointer select-none"
        style={{ WebkitAppRegion: 'drag' }}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onContextMenu={handleContextMenu}
        aria-label="MindNexus 悬浮球"
      >
        <Brain size={22} />
      </div>
    </div>
  )
}
