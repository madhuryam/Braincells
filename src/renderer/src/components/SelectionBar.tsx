import { useEffect } from 'react'
import { useMutate } from '../state/data'
import { useSelection } from '../state/selection'
import { useUndo } from '../state/undo'
import { rollingDays, upcomingWeeks } from '../format'
import { ProjectPicker } from './ProjectPicker'
import { isTyping } from './HotkeysHelp'

/**
 * A fixed bar that appears while a multi-selection is live: one click
 * schedules or files every ⌘-selected item at once, then the selection
 * dissolves — it's a triage gesture, not a persistent mode.
 */
export function SelectionBar(): React.JSX.Element | null {
  const { selected, clear } = useSelection()
  const mutate = useMutate()
  const { pushUndo } = useUndo()

  // Escape drops the whole selection — but never while typing.
  useEffect(() => {
    if (selected.size === 0) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && !isTyping(e)) clear()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected.size, clear])

  if (selected.size === 0) return null

  // One mutate wraps the whole batch, so the UI refreshes exactly once.
  // Each batch snapshots the touched fields first — ⌘Z walks the whole
  // triage gesture back in one step, every item to its old home.
  const applyAll = (patch: Parameters<typeof window.api.updateItem>[1], label: string): void => {
    const ids = [...selected]
    void mutate(async () => {
      const before = await Promise.all(ids.map((id) => window.api.getItem(id)))
      for (const id of ids) await window.api.updateItem(id, patch)
      pushUndo(label, async () => {
        for (const b of before) {
          if (!b) continue
          await window.api.updateItem(b.id, {
            scheduledDate: b.scheduledDate,
            status: b.status,
            projectId: b.projectId
          })
        }
      })
    })
    clear()
  }

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 18,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 45,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 12px',
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        boxShadow: 'var(--shadow-lift)'
      }}
    >
      <b style={{ fontSize: 14, whiteSpace: 'nowrap' }}>{selected.size} selected</b>
      {rollingDays().map((d) => (
        <button
          key={d.date}
          className="btn small"
          onClick={() =>
            applyAll({ scheduledDate: d.date, status: 'active' }, `Scheduled ${selected.size} items`)
          }
        >
          {d.chip}
        </button>
      ))}
      {upcomingWeeks().map((w) => (
        <button
          key={w.start}
          className="btn small"
          title={`${w.label} — they land on that Monday`}
          onClick={() =>
            applyAll({ scheduledDate: w.start, status: 'active' }, `Scheduled ${selected.size} items`)
          }
        >
          {w.chip}
        </button>
      ))}
      <ProjectPicker
        value={null}
        onChange={(projectId) => applyAll({ projectId }, `Filed ${selected.size} items`)}
      />
      <button className="btn ghost small" title="Clear selection (Esc)" onClick={clear}>
        ✕
      </button>
    </div>
  )
}
