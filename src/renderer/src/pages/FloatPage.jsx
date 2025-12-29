import { useRef, useState, useEffect } from 'react'
import { Brain, LayoutDashboard, EyeOff, MoreVertical, Sparkles, Search, Upload } from 'lucide-react'

const CLICK_MAX_DURATION_MS = 200
const CLICK_MAX_DISTANCE_PX = 5
const DRAG_THRESHOLD_PX = 6

export default function FloatPage() {
  const pointerRef = useRef({ time: 0, x: 0, y: 0 })
  const rippleTimerRef = useRef(null)
  const dragRef = useRef({
    active: false,
    startX: 0,
    startY: 0,
    winX: 0,
    winY: 0,
    moved: false
  })
  const rafRef = useRef(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [isPressing, setIsPressing] = useState(false)
  const [rippleOn, setRippleOn] = useState(false)
  const [isDragging, setIsDragging] = useState(false)

  const scheduleMove = (x, y) => {
    if (rafRef.current) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null
      window.api?.moveFloat?.(x, y)
    })
  }

  const handlePointerDown = (event) => {
    if (event.button !== 0) return
    event.currentTarget.setPointerCapture?.(event.pointerId)
    setIsPressing(true)
    pointerRef.current = { time: Date.now(), x: event.screenX, y: event.screenY }
    dragRef.current = {
      active: true,
      startX: event.screenX,
      startY: event.screenY,
      winX: window.screenX,
      winY: window.screenY,
      moved: false
    }
  }

  const handlePointerMove = (event) => {
    if (!dragRef.current.active) return
    const dx = event.screenX - dragRef.current.startX
    const dy = event.screenY - dragRef.current.startY
    const distance = Math.hypot(dx, dy)

    if (distance > DRAG_THRESHOLD_PX) {
      dragRef.current.moved = true
      if (!isDragging) setIsDragging(true)
      if (menuOpen) setMenuOpen(false)
    }

    const nextX = dragRef.current.winX + dx
    const nextY = dragRef.current.winY + dy
    scheduleMove(nextX, nextY)
  }

  const handlePointerUp = (event) => {
    if (!dragRef.current.active) return
    dragRef.current.active = false
    setIsPressing(false)

    const deltaTime = Date.now() - pointerRef.current.time
    const deltaX = Math.abs(event.screenX - pointerRef.current.x)
    const deltaY = Math.abs(event.screenY - pointerRef.current.y)
    const isClick =
      deltaTime < CLICK_MAX_DURATION_MS &&
      deltaX < CLICK_MAX_DISTANCE_PX &&
      deltaY < CLICK_MAX_DISTANCE_PX &&
      !dragRef.current.moved

    if (isClick) {
      setRippleOn(false)
      if (pointerRef.current.rafId) {
        cancelAnimationFrame(pointerRef.current.rafId)
      }
      pointerRef.current.rafId = requestAnimationFrame(() => {
        setRippleOn(true)
      })
      clearTimeout(rippleTimerRef.current)
      rippleTimerRef.current = setTimeout(() => setRippleOn(false), 400)
      window.api?.openMain?.()
    } else {
      const finalX = dragRef.current.winX + (event.screenX - dragRef.current.startX)
      const finalY = dragRef.current.winY + (event.screenY - dragRef.current.startY)
      window.api?.snapFloat?.(finalX, finalY)
    }

    setIsDragging(false)
  }

  const handleContextMenu = (event) => {
    event.preventDefault()
    window.api?.invoke?.('win:float-context-menu')
  }

  const handleHide = () => {
    window.api?.invoke?.('win:toggle-float')
  }

  const handleOpenMain = () => {
    window.api?.openMain?.()
    setMenuOpen(false)
  }

  const handleOpenMenu = () => {
    window.api?.invoke?.('win:float-context-menu')
    setMenuOpen(false)
  }

  const handleNavigate = (path) => {
    if (!path) return
    window.api?.navigateTo?.(path)
    setMenuOpen(false)
  }

  useEffect(() => {
    return () => {
      clearTimeout(rippleTimerRef.current)
      if (pointerRef.current.rafId) cancelAnimationFrame(pointerRef.current.rafId)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
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
          className={`float-menu absolute right-[78px] top-1/2 flex min-w-[190px] -translate-y-1/2 flex-col gap-2 rounded-2xl px-3 py-3 text-[11px] shadow-[0_18px_40px_-18px_rgba(15,23,42,0.35)] ring-1 ring-white/70 backdrop-blur transition-all duration-200 ${
            menuOpen ? 'opacity-100 translate-x-0' : 'pointer-events-none opacity-0 translate-x-3'
          }`}
          style={{ WebkitAppRegion: 'no-drag' }}
        >
          <span className="absolute -right-1 top-1/2 h-3 w-3 -translate-y-1/2 rotate-45 bg-slate-50/95 shadow-[0_8px_16px_-10px_rgba(15,23,42,0.35)] ring-1 ring-white/70" />
          <span className="text-[10px] font-semibold text-slate-500 tracking-wide">快捷操作</span>
          <div className="flex flex-col gap-2">
            <button
              className="float-menu-primary inline-flex h-9 w-full items-center gap-2 rounded-xl border border-white/80 px-3 text-xs font-medium text-white shadow transition hover:-translate-y-px focus:outline-none"
              onClick={handleOpenMain}
            >
              <LayoutDashboard size={14} />
              <span>主界面</span>
            </button>
            <button
              className="float-menu-action inline-flex h-9 w-full items-center gap-2 rounded-xl border border-white/80 px-3 text-xs font-medium text-slate-800 shadow transition hover:-translate-y-px focus:outline-none"
              onClick={() => handleNavigate('/chat')}
            >
              <Sparkles size={14} />
              <span>新对话</span>
            </button>
            <button
              className="float-menu-action inline-flex h-9 w-full items-center gap-2 rounded-xl border border-white/80 px-3 text-xs font-medium text-slate-800 shadow transition hover:-translate-y-px focus:outline-none"
              onClick={() => handleNavigate('/search')}
            >
              <Search size={14} />
              <span>快速搜索</span>
            </button>
            <button
              className="float-menu-action inline-flex h-9 w-full items-center gap-2 rounded-xl border border-white/80 px-3 text-xs font-medium text-slate-800 shadow transition hover:-translate-y-px focus:outline-none"
              onClick={() => handleNavigate('/import')}
            >
              <Upload size={14} />
              <span>导入文件</span>
            </button>
            <button
              className="float-menu-action inline-flex h-9 w-full items-center gap-2 rounded-xl border border-white/80 px-3 text-xs font-medium text-slate-800 shadow transition hover:-translate-y-px focus:outline-none"
              onClick={handleOpenMenu}
            >
              <MoreVertical size={14} />
              <span>菜单</span>
            </button>
            <button
              className="float-menu-muted inline-flex h-9 w-full items-center gap-2 rounded-xl border border-white/80 px-3 text-xs font-medium text-slate-700 shadow transition hover:-translate-y-px focus:outline-none"
              onClick={handleHide}
            >
              <EyeOff size={14} />
              <span>隐藏</span>
            </button>
          </div>
        </div>

        <div className="relative select-none">
          <div className="pointer-events-none absolute inset-0 rounded-full bg-gradient-to-br from-blue-500/30 via-sky-400/20 to-cyan-200/20 blur-md transition-opacity duration-500 animate-pulse" />
          <div className="pointer-events-none absolute inset-[-5px] rounded-full border border-white/40 bg-white/5 backdrop-blur-sm" />

          <div
            className={`float-ball relative flex h-[62px] w-[62px] items-center justify-center rounded-full text-white shadow-2xl transition-all duration-150 ease-out ${
              isPressing ? 'scale-95' : 'scale-100 hover:scale-[1.06]'
            } ${menuOpen ? 'shadow-[0_24px_44px_-14px_rgba(59,130,246,0.55)]' : ''} ${
              isDragging ? 'cursor-grabbing' : 'cursor-grab'
            } animate-float-soft`}
            style={{ WebkitAppRegion: 'no-drag' }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onContextMenu={handleContextMenu}
            aria-label="MindNexus 悬浮球"
          >
            <Brain size={24} className="drop-shadow" />
            {rippleOn ? (
              <span className="pointer-events-none absolute inset-0 animate-ripple-once rounded-full bg-white/50" />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
