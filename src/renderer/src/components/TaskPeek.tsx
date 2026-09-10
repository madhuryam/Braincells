import { useState } from 'react'
import { useLiveQuery, useMutate } from '../state/data'
import { shortTitle, useUndo } from '../state/undo'
import { CheckableInput, Checkbox } from './bits'
import { ConfirmButton } from './ConfirmButton'
import { PopOutIcon } from './DetailPanel'
import { ProjectPicker } from './ProjectPicker'
import { SectionPicker } from './SectionPicker'
import { SignalPicker } from './SignalPicker'
import { createSubtask, SubtaskTree } from './SubtaskTree'
import { LinkChips } from './LinkChips'
import { extractLinksFromHtml } from '../links'
import { ItemNotes } from './ItemNotes'
import { NotesSection } from './NotesSection'
import { ampm, durationLabel } from '../format'

const DURATIONS = [5, 10, 15, 30, 45, 60, 90, 120] // minutes
// Non-preset lengths (a custom end time) read plainly in minutes.
const durLabel = (m: number): string => (m < 60 || m % 30 !== 0 ? `${m} min` : `${m / 60} hr`)

function toMin(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}
const toHHMM = (m: number): string =>
  `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

/**
 * A time input you can actually type into. While focused it owns a
 * local draft (typing the hour, then the minutes, fires interim change
 * events) and commits once, on blur or Enter. Wiring `value` straight
 * to the store meant every half-typed segment patched the DB and the
 * live-query re-render snapped the field back mid-keystroke.
 */
function TimeField({
  value,
  onCommit
}: {
  value: string
  onCommit: (v: string) => void
}): React.JSX.Element {
  const [draft, setDraft] = useState<string | null>(null)
  return (
    <input
      type="time"
      step={60}
      value={draft ?? value}
      onFocus={() => setDraft(value)}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      onBlur={() => {
        // An empty draft (cleared field) reverts, same as before.
        if (draft && draft !== value) onCommit(draft)
        setDraft(null)
      }}
    />
  )
}

/**
 * The peek body for a time-blocked task, shown beside the schedule when
 * you click its block: check it off, retime it, repoint the project,
 * drop it off the calendar — and, like a meeting's panel, attach links
 * and write notes right here. Notes share the autosaving ItemNotes
 * editor with the detail peek; last save wins across surfaces.
 */
export function TaskPeek({
  itemId,
  localEventId = null,
  onClose,
  onOpenFull
}: {
  itemId: string
  /** Set when the peek opened from the task's EXTRA block (a linked
   *  local event): the time controls then edit that block's times,
   *  and "off calendar" removes that block — never the main slot. */
  localEventId?: string | null
  /** Called when the task leaves the calendar — the block this peek
   *  belongs to is gone, so the panel goes with it. */
  onClose?: () => void
  /** Open the task as a full canvas overlay — rendered as the popup
   *  button on the title line, beside ✕ (the panel adds no header). */
  onOpenFull?: () => void
}): React.JSX.Element | null {
  const item = useLiveQuery(() => window.api.getItem(itemId), [itemId])
  // A subtask's block only says its own title — the lineage line adds
  // which task (and chain of parents) it's a piece of.
  const ancestors = useLiveQuery(() => window.api.ancestorsOf(itemId), [itemId]) ?? []
  // The extra block this peek is anchored to, when there is one.
  const local = useLiveQuery(
    () => (localEventId ? window.api.getLocalEvent(localEventId) : Promise.resolve(null)),
    [localEventId]
  )
  // The task's total time on the calendar — every block summed. Shown
  // when it spans more than one block (with one, the visible range
  // already says it all).
  const totalMinutes = useLiveQuery(() => window.api.calendarMinutes(itemId), [itemId]) ?? 0
  const instances = useLiveQuery(() => window.api.calendarInstanceCount(itemId), [itemId]) ?? 0
  // The task's subtask tree — the SAME component the card editor
  // renders (nested adds, deletes, renames, drag-reorder included).
  const subtaskTree = useLiveQuery(() => window.api.subtaskTreeOf(itemId), [itemId]) ?? []
  const [subDraft, setSubDraft] = useState('')
  const mutate = useMutate()
  const { pushUndo } = useUndo()
  // Title: local draft only while focused; idle, the input mirrors
  // item.title so renames made elsewhere land here (ItemDetail's rule).
  const [titleDraft, setTitleDraft] = useState<string | null>(null)
  if (!item) return null

  const done = item.status === 'done'
  const patch = (p: Parameters<typeof window.api.updateItem>[1]): Promise<void> =>
    mutate(() => window.api.updateItem(item.id, p))

  // The block being viewed: the task's own slot, or the extra block
  // that was clicked — its times show and edit here instead.
  const isExtra = localEventId !== null
  const start = isExtra ? (local?.startTime ?? null) : item.scheduledTime
  const dur = isExtra
    ? local
      ? Math.max(1, toMin(local.endTime) - toMin(local.startTime))
      : 30
    : (item.timeEstimateMinutes ?? 30)
  const setStart = (v: string): void => {
    if (!isExtra) void patch({ scheduledTime: v })
    else if (local)
      void mutate(() =>
        window.api.updateLocalEvent(local.id, {
          startTime: v,
          endTime: toHHMM(Math.min(toMin(v) + dur, 23 * 60 + 59))
        })
      )
  }
  const setDuration = (mins: number): void => {
    if (!isExtra) void patch({ timeEstimateMinutes: mins })
    else if (local)
      void mutate(() =>
        window.api.updateLocalEvent(local.id, {
          endTime: toHHMM(Math.min(toMin(local.startTime) + mins, 23 * 60 + 59))
        })
      )
  }
  const offCalendar = (): void => {
    if (!isExtra) {
      const prev = { scheduledTime: item.scheduledTime, timeEstimateMinutes: item.timeEstimateMinutes }
      void patch({ scheduledTime: null, timeEstimateMinutes: null })
      pushUndo(`Took “${shortTitle(item.title)}” off the calendar`, async () => {
        await window.api.updateItem(item.id, prev)
      })
    } else if (local) {
      // Snapshot the block before deleting — ⌘Z rebuilds it.
      const b = { ...local }
      void mutate(() => window.api.deleteLocalEvent(local.id))
      pushUndo(`Removed a block of “${shortTitle(item.title)}”`, async () => {
        await window.api.createLocalEvent({
          title: b.title,
          date: b.date,
          startTime: b.startTime,
          endTime: b.endTime,
          projectId: b.projectId,
          itemId: b.itemId
        })
      })
    }
    onClose?.()
  }

  const addSubtask = async (title: string): Promise<void> => {
    await mutate(() => createSubtask(item.id, item.projectId, title))
  }

  return (
    <div className="stack task-peek">
      <div className="row">
        <Checkbox checked={done} onToggle={() => patch({ status: done ? 'active' : 'done' })} />
        <input
          className="peek-title"
          style={{ textDecoration: done ? 'line-through' : undefined }}
          value={titleDraft ?? item.title}
          placeholder="Untitled"
          onFocus={() => setTitleDraft(item.title)}
          onChange={(e) => setTitleDraft(e.target.value)}
          onBlur={() => {
            const t = titleDraft
            setTitleDraft(null)
            if (t !== null && t !== item.title) void patch({ title: t })
          }}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
        {/* Panel controls share the title line — a header row of their
            own pushed everything down and split the top of the peek. */}
        <span className="row" style={{ marginLeft: 'auto', flexShrink: 0 }}>
          {/* Two-step: the 🗑 arms into a confirm, so a stray click
              near ✕ can't discard the task. Undoable either way. */}
          <ConfirmButton
            label="🗑"
            confirmLabel="🗑?"
            className="btn ghost icon-btn"
            style={{ fontSize: 13 }}
            title="Delete this task (it goes away, guilt-free)"
            onConfirm={() => {
              const prev = item.status
              void mutate(() => window.api.updateItem(item.id, { status: 'dropped' }))
              pushUndo(`Dropped “${shortTitle(item.title)}”`, async () => {
                await window.api.updateItem(item.id, { status: prev })
              })
              onClose?.()
            }}
          />
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

      {/* Where this piece belongs: the whole chain, outermost first. */}
      {ancestors.length > 0 && (
        <div style={{ fontSize: 13, color: 'var(--text-soft)', marginTop: -4 }}>
          ↳ part of{' '}
          {ancestors.map((a, i) => (
            <span key={a.id}>
              {i > 0 && <span style={{ color: 'var(--text-faint)' }}> › </span>}
              <span style={{ fontWeight: 600 }}>{a.title || 'Untitled'}</span>
            </span>
          ))}
        </div>
      )}

      {/* When it sits on the calendar and for how long. Start and end
          edit to the minute (the 15-min grid is only the drag default);
          the end field writes back as the duration. The preset list
          gains the block's current length when it's a non-standard one,
          so the select never lies about what's set. */}
      <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
        <label className="pill">
          ⏱
          <TimeField value={start ?? ''} onCommit={setStart} />
        </label>
        {start && (
          <label className="pill">
            –
            <TimeField
              value={toHHMM(Math.min(toMin(start) + dur, 23 * 60 + 59))}
              onCommit={(v) => {
                // An end at or before the start would be a zero/negative
                // block — ignored, and the field snaps back on blur.
                const mins = toMin(v) - toMin(start)
                if (mins > 0) setDuration(mins)
              }}
            />
          </label>
        )}
        <label className="pill">
          for
          <select value={dur} onChange={(e) => setDuration(Number(e.target.value))}>
            {(DURATIONS.includes(dur) ? DURATIONS : [...DURATIONS, dur].sort((a, b) => a - b)).map((m) => (
              <option key={m} value={m}>
                {durLabel(m)}
              </option>
            ))}
          </select>
        </label>
        {start && (
          <span className="pill" style={{ color: 'var(--text-soft)' }}>
            {ampm(start)}–{ampm(toHHMM(Math.min(toMin(start) + dur, 23 * 60 + 59)))}
          </span>
        )}
        {/* Which of the task's blocks these controls edit. */}
        {isExtra && (
          <span className="pill" style={{ color: 'var(--text-faint)' }} title="This peek edits the extra block you clicked — the task's own slot is unaffected">
            extra block
          </span>
        )}
        {/* The sum over all this task's blocks (the card pill's old job). */}
        {instances > 1 && (
          <span
            className="pill"
            style={{ color: 'var(--text-soft)' }}
            title={`Total time on the calendar across ${instances} blocks`}
          >
            Σ {durationLabel(totalMinutes)} in {instances} blocks
          </span>
        )}
        <button
          className="btn ghost small"
          style={{ marginLeft: 'auto' }}
          title={
            isExtra
              ? 'Remove this extra block — the task keeps its own slot'
              : 'Keep the task, take it off the calendar'
          }
          onClick={offCalendar}
        >
          ✕ off calendar
        </button>
      </div>

      {/* Which of the five "what happens next" slots this task holds. */}
      <SignalPicker
        value={item.signalPriority}
        onPick={(p) => void mutate(() => window.api.setSignal(item.id, p))}
      />

      <ProjectPicker value={item.projectId} onChange={(projectId) => patch({ projectId })} />
      {/* Once a project is picked, its sections offer themselves —
          file the task into a subsection, not just project General. */}
      <SectionPicker
        projectId={item.projectId}
        value={item.sectionId}
        onChange={(sectionId) => patch({ sectionId })}
      />

      {/* Subtasks — the exact tree the card editor shows: check off,
          rename, drop (✕), nest deeper (＋), drag to reorder. */}
      <SubtaskTree parent={item} tree={subtaskTree} />
      <CheckableInput
        placeholder="Add a subtask…"
        value={subDraft}
        onChange={(e) => setSubDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && subDraft.trim()) {
            void addSubtask(subDraft.trim())
            setSubDraft('')
          }
        }}
      />

      {/* Attached URLs, same chips as a meeting's panel; hyperlinks in
          the notes ride along read-only. */}
      <LinkChips
        links={item.links}
        derived={extractLinksFromHtml(item.richContent ?? '')}
        onSave={(next) => {
          const prev = item.links
          void patch({ links: next })
          pushUndo(`Changed “${shortTitle(item.title)}”’s links`, async () => {
            await window.api.updateItem(item.id, { links: prev })
          })
        }}
      />

      {/* The same Notes section a meeting's panel shows — shared
          chrome, and the editor owns the rest of the panel's height. */}
      <NotesSection fill>
        <ItemNotes item={item} variant="full" toolbar />
      </NotesSection>
    </div>
  )
}
