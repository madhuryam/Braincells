import type { ReactNode } from 'react'

/** Two overlapping windows — the "open as a popup" glyph (the ↗ arrow
 *  read as "leave", which the overlay never does). */
export function PopOutIcon(): React.JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
      <rect
        x="5.2"
        y="2.6"
        width="8.6"
        height="7.4"
        rx="1.7"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M2.6 6.4 V11.7 A1.7 1.7 0 0 0 4.3 13.4 H9.9"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

/**
 * The right-hand peek panel: shows a meeting or item beside the list
 * that opened it, so browsing the log never means losing your place.
 * Content that has a fuller home (meetings) gets an "open full page"
 * action in the header. When the child renders its own header row
 * (ItemDetail does, ✕ included), pass nothing here and the panel
 * skips its header entirely.
 */
export function DetailPanel({
  title,
  onOpenFull,
  onClose,
  actions,
  children
}: {
  title?: string
  onOpenFull?: () => void
  onClose?: () => void
  /** Extra header buttons, seated with the popup/close pair. */
  actions?: ReactNode
  children: ReactNode
}): React.JSX.Element {
  const hasHeader = Boolean(title || onOpenFull || onClose || actions)
  return (
    <aside className="detail-panel">
      {hasHeader && (
        <div className="detail-panel-header row">
          {title && (
            // The title doubles as the open-full affordance — clicking a
            // thing's name to go to it needs no label.
            <h2
              style={{
                flex: 1,
                minWidth: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                cursor: onOpenFull ? 'pointer' : undefined
              }}
              title={onOpenFull ? 'Open full view' : undefined}
              onClick={onOpenFull}
            >
              {title}
            </h2>
          )}
          <span className="row" style={{ marginLeft: 'auto', flexShrink: 0 }}>
            {actions}
            {onOpenFull && (
              <button className="btn ghost icon-btn" title="Open full view" onClick={onOpenFull}>
                <PopOutIcon />
              </button>
            )}
            {onClose && (
              <button className="btn ghost icon-btn" title="Close panel" onClick={onClose}>
                ✕
              </button>
            )}
          </span>
        </div>
      )}
      {children}
    </aside>
  )
}
