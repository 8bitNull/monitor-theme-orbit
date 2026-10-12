import { useEffect, useRef, useState } from "react"

/** 轻量下拉：点外关闭、Esc 关闭，桌面悬停无、移动触控可用。 */
export function Dropdown({ button, children, align = "left", panelClass = "", label }: {
  button: (open: boolean) => React.ReactNode
  children: React.ReactNode | ((close: () => void) => React.ReactNode)
  align?: "left" | "right"
  panelClass?: string
  label?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const close = (restoreFocus = false) => {
    setOpen(false)
    if (restoreFocus) requestAnimationFrame(() => triggerRef.current?.focus())
  }

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close(true)
    }
    document.addEventListener("pointerdown", onDown)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("pointerdown", onDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <button ref={triggerRef} type="button" className="dropdown-trigger" aria-label={label} onClick={() => setOpen((v) => !v)} aria-expanded={open}>{button(open)}</button>
      {open && (
        <div className={`dropdown-panel ${align === "right" ? "right-0" : "left-0"} ${panelClass}`} onClick={(e) => e.stopPropagation()}>
          {typeof children === "function" ? children(() => close(true)) : children}
        </div>
      )}
    </div>
  )
}

/** 轻提示，两秒半自动消失。 */
export function Toast({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <div className="fixed left-1/2 top-20 z-[999] -translate-x-1/2">
      <div className="offline-badge text-sm">{message}</div>
    </div>
  )
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} />
}

/** 数值微组件：横向两端对齐的一行（标签在左、值在右）。 */
export function MetricRow({ icon, label, value, valueClass = "", extra }: {
  icon: string
  label: React.ReactNode
  value: React.ReactNode
  valueClass?: string
  extra?: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-2 min-w-0">
      <div className="flex items-center gap-1 text-secondary shrink-0">
        <i className={`ti ${icon} md-14`} aria-hidden />
        <span className="text-xs font-medium">{label}</span>
      </div>
      {extra}
      <span className={`text-xs font-normal text-main tabular-nums text-right truncate ${valueClass}`}>{value}</span>
    </div>
  )
}
