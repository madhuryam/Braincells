import { useEffect, useRef, type ReactNode } from 'react'

/**
 * A small in-app context menu fixed at the cursor — the shell shared
 * by every right-click surface (task blocks, section headers). Handles
 * its own dismissal: a click anywhere else (capture-phase, so the
 * stray click doesn't land) or Escape. The caller owns the buttons.
 */
export function ContextMenu({
  x,
  y,
  onClose,
  children
}: {
  x: number
  y: number
  onClose: () => void
  children: ReactNode
}): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onDown = (e: PointerEvent): void => {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('pointerdown', onDown, true)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  return (
    <div
      ref={ref}
      style={{
        position: 'fixed',
        top: y,
        left: x,
        zIndex: 50,
        display: 'flex',
        flexDirection: 'column',
        minWidth: 160,
        padding: 4,
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        boxShadow: 'var(--shadow-lift)'
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {children}
    </div>
  )
}
