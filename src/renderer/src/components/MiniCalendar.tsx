import { useState } from 'react'
import { todayYmd } from '@shared/dates'

/**
 * A small always-works month calendar for jumping to a date — no
 * reliance on the native input picker (showPicker() needs transient
 * user activation and fires only sporadically from a context menu).
 * Weeks start Monday, ‹ › page months, today is ringed, the selected
 * day filled.
 */
export function MiniCalendar({
  value,
  onPick
}: {
  value: string
  onPick: (date: string) => void
}): React.JSX.Element {
  const [y0, m0] = value.split('-').map(Number)
  const [view, setView] = useState({ y: y0, m: m0 }) // m is 1-based
  const today = todayYmd()

  const monthLabel = new Date(view.y, view.m - 1, 1).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric'
  })
  const daysInMonth = new Date(view.y, view.m, 0).getDate()
  // Monday-first offset of the 1st (getDay: 0 = Sunday).
  const lead = (new Date(view.y, view.m - 1, 1).getDay() + 6) % 7
  const ymd = (d: number): string =>
    `${view.y}-${String(view.m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  const shift = (by: number): void => {
    const next = new Date(view.y, view.m - 1 + by, 1)
    setView({ y: next.getFullYear(), m: next.getMonth() + 1 })
  }

  return (
    <div className="mini-cal">
      <div className="mini-cal-head">
        <button className="btn ghost icon-btn" title="Previous month" onClick={() => shift(-1)}>
          ‹
        </button>
        <span>{monthLabel}</span>
        <button className="btn ghost icon-btn" title="Next month" onClick={() => shift(1)}>
          ›
        </button>
      </div>
      <div className="mini-cal-grid">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
          <span key={i} className="mini-cal-dow">
            {d}
          </span>
        ))}
        {Array.from({ length: lead }, (_, i) => (
          <span key={`pad-${i}`} />
        ))}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const date = ymd(i + 1)
          return (
            <button
              key={date}
              className={`mini-cal-day${date === value ? ' selected' : ''}${date === today ? ' today' : ''}`}
              onClick={() => onPick(date)}
            >
              {i + 1}
            </button>
          )
        })}
      </div>
    </div>
  )
}
