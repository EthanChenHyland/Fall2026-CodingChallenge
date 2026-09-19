import { SlidersHorizontal } from 'lucide-react'
import { type ReactNode, useEffect, useId, useRef, useState } from 'react'

export function FilterMenu({ activeCount = 0, children, label = 'Filters' }: {
  activeCount?: number
  children: ReactNode
  label?: string
}) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const panelId = useId()

  useEffect(() => {
    if (!open) return
    const closeOutside = (event: PointerEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', closeOutside)
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOutside)
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  return (
    <div className="filter-menu-wrap" ref={wrapRef}>
      <button
        type="button"
        className={`filter-menu-trigger${open ? ' active' : ''}`}
        aria-label={activeCount ? `${label}, ${activeCount} active` : label}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((current) => !current)}
      >
        <SlidersHorizontal size={17} />
        {activeCount > 0 ? <span>{activeCount}</span> : null}
      </button>
      {open ? <div id={panelId} className="filter-menu-popover" role="group" aria-label={label}>{children}</div> : null}
    </div>
  )
}
