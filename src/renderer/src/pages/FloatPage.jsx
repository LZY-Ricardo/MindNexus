import { useRef, useState, useEffect } from 'react'
import { Brain, LayoutDashboard, EyeOff, MoreVertical } from 'lucide-react'

const CLICK_MAX_DURATION_MS = 200
const CLICK_MAX_DISTANCE_PX = 5

export default function FloatPage() {
  const pointerRef = useRef({ time: 0, x: 0, y: 0 })
  const rippleTimerRef = useRef(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [isPressing, setIsPressing] = useState(false)
  const [rippleOn, setRippleOn] = useState(false)

  const handleMouseDown = (event) => {
    if (event.button !== 0) return
    setIsPressing(true)
    pointerRef.current = { time: Date.now(), x: event.clientX, y: event.clientY }
  }

  const handleMouseUp = (event) => {
    if (event.button !== 0) return
    setIsPressing(false)

    const deltaTime = Date.now() - pointerRef.current.time
    const deltaX = Math.abs(event.clientX - pointerRef.current.x)
    const deltaY = Math.abs(event.clientY - pointerRef.current.y)

    const isClick =
      deltaTime < CLICK_MAX_DURATION_MS &&
      deltaX < CLICK_MAX_DISTANCE_PX &&
      deltaY < CLICK_MAX_DISTANCE_PX
    if (!isClick) return

    setRippleOn(false)
    if (pointerRef.current.rafId) {
      cancelAnimationFrame(pointerRef.current.rafId)
    }
    pointerRef.current.rafId = requestAnimationFrame(() => {
      setRippleOn(true)
    })
    clearTimeout(rippleTimerRef.current)
    rippleTimerRef.current = setTimeout(() => setRippleOn(false), 400)

    window.api?.invoke?.('win:open-main')
  }

  const handleContextMenu = (event) => {
    event.preventDefault()
    window.api?.invoke?.('win:float-context-menu')
  }

  const handleHide = () => {
    window.api?.invoke?.('win:toggle-float')
  }

  const handleOpenMain = () => {
    window.api?.invoke?.('win:open-main')
    setMenuOpen(false)
  }

  const handleOpenMenu = () => {
    window.api?.invoke?.('win:float-context-menu')
    setMenuOpen(false)
  }

  useEffect(() => {
    return () => {
      clearTimeout(rippleTimerRef.current)
      if (pointerRef.current.rafId) cancelAnimationFrame(pointerRef.current.rafId)
    }
  }, [])

  return (
    <div className="h-screen w-screen bg-transparent flex items-center justify-center pointer-events-none">
      <div
        className="relative flex w-full max-w-[280px] items-center justify-end px-4 pointer-events-auto"
        style={{ WebkitAppRegion: 'no-drag' }}
        onMouseEnter={() => setMenuOpen(true)}
        onMouseLeave={() => {
          setMenuOpen(false)
          setIsPressing(false)
        }}
      >
        <div
          className={`absolute right-[78px] top-1/2 flex min-w-[170px] -translate-y-1/2 flex-col gap-2 rounded-2xl bg-slate-50/92 px-3 py-3 text-[11px] text-slate-800 shadow-[0_18px_40px_-18px_rgba(15,23,42,0.35)] ring-1 ring-white/70 backdrop-blur transition-all duration-200 ${
            menuOpen ? 'opacity-100 translate-x-0' : 'pointer-events-none opacity-0 translate-x-3'
          }`}
          style={{ WebkitAppRegion: 'no-drag' }}
        >
          <span className="absolute -right-1 top-1/2 h-3 w-3 -translate-y-1/2 rotate-45 bg-slate-50/95 shadow-[0_8px_16px_-10px_rgba(15,23,42,0.35)] ring-1 ring-white/70" />
          <span className="text-[10px] font-semibold text-slate-500 tracking-wide">
            快捷操作
          </span>
          <div className="flex flex-col gap-2">
            <button
              className="inline-flex h-9 w-full items-center gap-2 rounded-xl border border-white/80 bg-slate-900/90 px-3 text-xs font-medium text-white shadow transition hover:-translate-y-px hover:bg-slate-900 focus:outline-none"
              onClick={handleOpenMain}
            >
              <LayoutDashboard size={14} />
              <span>主界面</span>
            </button>
            <button
              className="inline-flex h-9 w-full items-center gap-2 rounded-xl border border-white/80 bg-white/90 px-3 text-xs font-medium text-slate-800 shadow transition hover:-translate-y-px hover:bg-white focus:outline-none"
              onClick={handleOpenMenu}
            >
              <MoreVertical size={14} />
              <span>菜单</span>
            </button>
            <button
              className="inline-flex h-9 w-full items-center gap-2 rounded-xl border border-white/80 bg-slate-100/95 px-3 text-xs font-medium text-slate-700 shadow transition hover:-translate-y-px hover:bg-white focus:outline-none"
              onClick={handleHide}
            >
              <EyeOff size={14} />
              <span>隐藏</span>
            </button>
          </div>
        </div>

        <div className="relative select-none">
          <div className="pointer-events-none absolute inset-0 rounded-full bg-gradient-to-br from-blue-500/30 via-sky-400/20 to-purple-500/25 blur-md transition-opacity duration-500 animate-pulse" />
          <div className="pointer-events-none absolute inset-[-4px] rounded-full border border-white/40 bg-white/5 backdrop-blur-sm" />

          <div
            className={`relative flex h-[58px] w-[58px] items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 via-sky-500 to-purple-500 text-white shadow-2xl transition-all duration-150 ease-out ${
              isPressing ? 'scale-95' : 'scale-100 hover:scale-105'
            } ${menuOpen ? 'shadow-[0_20px_40px_-12px_rgba(59,130,246,0.55)]' : ''} animate-float-soft`}
            style={{ WebkitAppRegion: 'drag' }}
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
            onContextMenu={handleContextMenu}
            aria-label="MindNexus 悬浮球"
          >
            <Brain size={24} className="drop-shadow" />
            {rippleOn ? <span className="pointer-events-none absolute inset-0 animate-ripple-once rounded-full bg-white/50" /> : null}
          </div>
        </div>
      </div>
    </div>
  )
}
