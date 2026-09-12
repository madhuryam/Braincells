import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { todayYmd, ymdAddDays } from '@shared/dates'
import { useLiveQuery, useMutate } from '../state/data'
import { useSignalRoots } from '../state/signals'
import { useEditing } from '../state/editing'
import { useNav } from '../state/nav'
import { MeetingPeekProvider } from '../state/peek'
import { ContextMenu } from '../components/ContextMenu'
import { DetailPanel } from '../components/DetailPanel'
import { DoneList } from '../components/DoneList'
import { MiniCalendar } from '../components/MiniCalendar'
import { SignalReconcile } from '../components/SignalReconcile'
import { TaskPeek } from '../components/TaskPeek'
import { AdHocDeleteButton, Meeting } from './Meeting'
import { ItemCard } from '../components/ItemCard'
import { TaskGroups } from '../components/TaskGroups'
import { ProjectPicker } from '../components/ProjectPicker'
import { DraggableCard, DropZone } from '../components/dnd'
import { Timeline } from '../components/Timeline'
import { BackButton, CheckableInput, EmptyState } from '../components/bits'
import { longDate, rollingDays, upcomingWeeks, type RollingDay, type UpcomingWeek } from '../format'

/** 'August 5' — the weekday already leads the header, so no repeat. */
function monthDay(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'long', day: 'numeric' })
}

const TOP_TASK_CAP = 5 // soft cap — never a hard limit (SPEC §4.1)

/** A wide open chevron (∨ / ∧) — roomier than the ▾/▴ glyphs. */
function Chevron({ up }: { up: boolean }): React.JSX.Element {
  return (
    <svg width="16" height="9" viewBox="0 0 16 9" aria-hidden>
      <path
        d={up ? 'M1.5 7.5 L8 1.5 L14.5 7.5' : 'M1.5 1.5 L8 7.5 L14.5 1.5'}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function Today(): React.JSX.Element {
  const today = todayYmd()
  // ‹ › page the schedule/tasks/done to another day; sections about
  // *now* (carried over, the rolling week, triage) stay on real today.
  const [date, setDate] = useState(today)
  const tasks = useLiveQuery(() => window.api.tasksFor(date), [date]) ?? []
  // Only the count is needed here — the DoneList element owns the
  // grouping (standalone cards + subtask lineage under each parent).
  const doneToday = useLiveQuery(() => window.api.completedOn(date), [date]) ?? []
  // Folded until asked for — done work is a record, not the day's focus.
  const [showDone, setShowDone] = useState(false)
  // "Coming up" starts folded everywhere — it's context, not the
  // page's subject — and folds again whenever the view lands on a
  // fresh day (open, reload, paging). Expanding it is a per-visit ask.
  const [showComingUp, setShowComingUp] = useState(false)
  useEffect(() => setShowComingUp(false), [date, today])
  // 📥 Intake: unfiled captures (⌥Space dumps, meeting follow-ups) to
  // categorize from right here — the Inbox tab is gone.
  const intake = useLiveQuery(() => window.api.inboxItems(), []) ?? []
  // Undated active tasks, parked at the very bottom of the page.
  const backlog = useLiveQuery(() => window.api.backlogTasks(), []) ?? []
  const [showBacklog, setShowBacklog] = useState(false)
  const mutate = useMutate()
  const { openOverlay } = useNav()
  const [taskDraft, setTaskDraft] = useState('')
  // Right-click on the header: an in-app month calendar at the cursor
  // to jump straight to any date (no arrow-by-arrow paging). Built-in,
  // not the native picker — showPicker() only sporadically honors a
  // right-click's activation, so it worked "sometimes".
  const [jumpMenu, setJumpMenu] = useState<{ x: number; y: number } | null>(null)
  const openDateJump = (e: React.MouseEvent): void => {
    e.preventDefault()
    setJumpMenu({ x: e.clientX, y: e.clientY })
  }
  // Everything shows by default — "Show fewer" is the opt-in trim,
  // not the other way around.
  const [showAll, setShowAll] = useState(true)
  // ⚡ filter: only the signal tasks — across every project and
  // subsection of the day's list (a signaled SUBTASK keeps its whole
  // card in view). Session-only, like the folds.
  const [signalsOnly, setSignalsOnly] = useState(false)
  const signalRoots = useSignalRoots()
  // Carryover collision: an unfinished signal rode into today and its
  // slot is contested. The rollover only raises the flag — the modal
  // asks the user which tasks keep today's five slots. Dismissing
  // parks it for this session; the flag stays until it's resolved.
  const signalConflict = useLiveQuery(() => window.api.getSetting<string>('signalConflict'), [])
  const [conflictParked, setConflictParked] = useState(false)
  // The header's collapse-all/expand-all for the day's project blocks;
  // each click broadcasts (seq bump), then blocks toggle freely again.
  const [fold, setFold] = useState({ seq: 0, collapsed: false })
  // A clicked calendar event peeks in a panel over the schedule —
  // no page navigation just to glance at a meeting.
  const [peek, setPeek] = useState<{ eventKey: string; title: string; date: string } | null>(null)
  // A clicked time-blocked task peeks in the same panel slot. The
  // localEventId rides along when the click was on the task's EXTRA
  // block, so the peek edits that block's times, not the main slot.
  const [peekTask, setPeekTask] = useState<{ itemId: string; localEventId?: string } | null>(null)
  const closePeeks = (): void => {
    setPeek(null)
    setPeekTask(null)
  }
  // The peek panel is fixed to the viewport (so it never scrolls off),
  // which means it can't inherit the schedule column's width/position —
  // measure the pane and hand the panel its horizontal box. Anchored to
  // the pane's right edge, at least the pane's width but never under
  // 500px (it grows leftward over the day list when the pane is narrow).
  const paneRef = useRef<HTMLElement>(null)
  const [peekBox, setPeekBox] = useState<{ right: number; width: number } | null>(null)
  useLayoutEffect(() => {
    if (!peek && !peekTask) return
    const measure = (): void => {
      const el = paneRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      setPeekBox({
        right: Math.round(window.innerWidth - r.right),
        width: Math.max(Math.round(r.width), 500)
      })
    }
    measure()
    const ro = new ResizeObserver(measure)
    if (paneRef.current) ro.observe(paneRef.current)
    window.addEventListener('resize', measure)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [peek, peekTask])
  useEffect(() => {
    if (!peek && !peekTask) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') closePeeks()
    }
    const onDown = (e: MouseEvent): void => {
      // Don't dismiss on the drag that retimes a block on the timeline.
      const t = e.target as HTMLElement
      if (!t.closest('.timeline-peek') && !t.closest('.timeline-task')) closePeeks()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onDown)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onDown)
    }
  }, [peek, peekTask])

  const dayTasks =
    signalsOnly && signalRoots ? tasks.filter((t) => signalRoots.has(t.id)) : tasks
  const visibleTasks = showAll ? dayTasks : dayTasks.slice(0, TOP_TASK_CAP)

  // Straight onto today's list — no inbox detour for things you
  // already know are tasks for today.
  const addTask = async (): Promise<void> => {
    const title = taskDraft.trim()
    if (!title) return
    await mutate(() =>
      window.api.createItem({ kind: 'task', title, status: 'active', scheduledDate: date, atTop: true })
    )
    setTaskDraft('')
  }

  return (
    <div className="canvas">
      <header className="canvas-header" onContextMenu={openDateJump}>
        <BackButton />
        {/* One continuous phrase in header type. Its min-width fits the
            longest date, so the nav buttons beside it never move. */}
        <h1 style={{ minWidth: 330 }}>
          {date === today ? `Today · ${monthDay(date)}` : longDate(date)}
        </h1>
        <span className="row" title="Right-click to jump to a date">
          <button className="btn ghost icon-btn" title="Previous day" onClick={() => setDate(ymdAddDays(date, -1))}>
            ‹
          </button>
          <button className="btn ghost" disabled={date === today} onClick={() => setDate(today)}>
            today
          </button>
          <button className="btn ghost icon-btn" title="Next day" onClick={() => setDate(ymdAddDays(date, 1))}>
            ›
          </button>
        </span>
      </header>

      {jumpMenu && (
        <ContextMenu x={jumpMenu.x} y={jumpMenu.y} onClose={() => setJumpMenu(null)}>
          <MiniCalendar
            value={date}
            onPick={(d) => {
              setDate(d)
              setJumpMenu(null)
            }}
          />
        </ContextMenu>
      )}

      {signalConflict === today && !conflictParked && (
        <SignalReconcile onClose={() => setConflictParked(true)} />
      )}

      {/* Cards deep in the lists can peek a linked meeting here beside
          the schedule — same panel a clicked calendar event uses. */}
      <MeetingPeekProvider
        onPeek={(m) => {
          setPeekTask(null)
          setPeek(m)
        }}
      >
        <div className="today-grid">
          {/* Left column: tasks for the rolling 5-day window. (The old
            "Capture anything" input is gone — the task quick-add below
            and ⌥Space capture cover both cases.) */}
          <section>
            {/* The viewed day's own sections sit on a soft accent wash;
              the rest of the week stays plain below. */}
            <div className="today-scope">
              <DropZone id="list-today" data={{ type: 'schedule', date }}>
                <div className="row" style={{ margin: '14px 0 10px', gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <CheckableInput
                      id="quick-capture"
                      placeholder="Add a task for today…"
                      value={taskDraft}
                      onChange={(e) => setTaskDraft(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && addTask()}
                    />
                  </div>
                  {/* ⚡ trims the day to just the signals; the chevron
                    beside it packs the whole column up. */}
                  <button
                    className={`btn icon-btn ${signalsOnly ? 'primary' : 'ghost'}`}
                    title={
                      signalsOnly
                        ? 'Showing only signals — click for everything'
                        : 'Show only signals (what happens next)'
                    }
                    onClick={() => setSignalsOnly(!signalsOnly)}
                  >
                    ⚡
                  </button>
                  {/* Hugs the task list's top-right corner: one click
                    folds/unfolds every project block below AND the
                    Coming up section — the whole column packs up. */}
                  <button
                    className="btn ghost icon-btn"
                    title={fold.collapsed ? 'Expand all' : 'Collapse all'}
                    onClick={() => {
                      const collapsed = !fold.collapsed
                      setFold((f) => ({ seq: f.seq + 1, collapsed }))
                      setShowComingUp(!collapsed)
                    }}
                  >
                    <Chevron up={!fold.collapsed} />
                  </button>
                </div>
                {/* The lotus only when the day is truly blank: if items
                sit in Done, the slate wasn't clean — it's been worked
                through (today) or swept forward (a past day). The
                section stays (blank) as a drop target either way. */}
                {tasks.length === 0 && doneToday.length === 0 && (
                  <EmptyState art=""> no currently scheduled tasks
                  </EmptyState>
                )}
                {/* One block per project; drag to reprioritize within a block.
                The show-all control lives inside the last block so it
                folds away with it. */}
                <TaskGroups
                  items={visibleTasks}
                  date={date}
                  sortable
                  fold={fold}
                  footer={
                    tasks.length > TOP_TASK_CAP ? (
                      <button className="btn ghost" style={{ marginTop: 4 }} onClick={() => setShowAll(!showAll)}>
                        {showAll ? 'Show fewer' : `Show all ${tasks.length}`}
                      </button>
                    ) : undefined
                  }
                />
              </DropZone>

              {/* Checked-off things don't vanish — they move down here,
              still uncheckable if it was an accident. */}
              {doneToday.length > 0 && (
                <>
                  <button className="section-label day-toggle" onClick={() => setShowDone(!showDone)}>
                    {showDone ? '▾' : '▸'} {date === today ? 'Done today' : 'Done'}
                    <span className="pill">{doneToday.length}</span>
                  </button>
                  {showDone && <DoneList date={date} />}
                </>
              )}

            </div>

            {/* 📥 Intake: unfiled captures and meeting follow-ups waiting
            for a home. Checkboxes gather a selection (the floating bar
            schedules several at once); drag one onto a sidebar project
            or a day below, or open it and file it — it leaves here the
            moment it's claimed. */}
            {intake.length > 0 && (
              <>
                <div className="section-label coming-up row">
                  📥 Intake
                  <span className="pill">{intake.length}</span>
                </div>
                <div className="item-list">
                  <AnimatePresence initial={false}>
                    {intake.map((item) => (
                      <DraggableCard key={item.id} item={item}>
                        <ItemCard item={item} checkboxSelects />
                      </DraggableCard>
                    ))}
                  </AnimatePresence>
                </div>
              </>
            )}

            {/* The rest of the 5-day window, one collapsible group per
            day — then the horizon coarsens to whole weeks. */}
            <button
              className="section-label day-toggle coming-up"
              onClick={() => setShowComingUp(!showComingUp)}
            >
              {showComingUp ? '▾' : '▸'} Coming up
            </button>
            {showComingUp && (
              <>
                {rollingDays()
                  .slice(1)
                  .map((day) => (
                    <DaySection key={day.date} day={day} />
                  ))}
                {upcomingWeeks().map((week) => (
                  <WeekSection key={week.start} week={week} />
                ))}
              </>
            )}

            {/* Undated tasks sink to the very bottom, folded — around,
            not in the way, until one gets dragged onto a day. */}
            {backlog.length > 0 && (
              <>
                <button
                  className="section-label day-toggle coming-up"
                  onClick={() => setShowBacklog(!showBacklog)}
                >
                  {showBacklog ? '▾' : '▸'} Backlog
                  <span className="pill">{backlog.length}</span>
                </button>
                {showBacklog && (
                  <div className="item-list">
                    <AnimatePresence initial={false}>
                      {backlog.map((item) => (
                        <DraggableCard key={item.id} item={item}>
                          <ItemCard item={item} />
                        </DraggableCard>
                      ))}
                    </AnimatePresence>
                  </div>
                )}
              </>
            )}
          </section>

          {/* Right column: the chosen day's schedule (events + time blocks). */}
          <section className="timeline-pane" ref={paneRef}>
            <div className="section-label">Schedule</div>
            {/* The fill layer lets the timeline run the full length of the
              day list beside it (see .timeline-fill in app.css). */}
            <div className="timeline-fill">
              <Timeline
                date={date}
                onPeekEvent={(e) => {
                  setPeekTask(null)
                  setPeek(e)
                }}
                onPeekTask={(itemId, localEventId) => {
                  setPeek(null)
                  setPeekTask({ itemId, localEventId })
                }}
              />
            </div>
            {peek && (
              <div
                className="timeline-peek"
                style={peekBox ? { right: peekBox.right, width: peekBox.width } : undefined}
              >
                <DetailPanel
                  title={peek.title}
                  actions={
                    <AdHocDeleteButton
                      eventKey={peek.eventKey}
                      date={peek.date}
                      onDeleted={closePeeks}
                    />
                  }
                  onOpenFull={() =>
                    openOverlay({ name: 'meeting', eventKey: peek.eventKey, title: peek.title, date: peek.date })
                  }
                  onClose={() => setPeek(null)}
                >
                  <Meeting
                    key={peek.eventKey}
                    embedded
                    eventKey={peek.eventKey}
                    title={peek.title}
                    date={peek.date}
                    onDeleted={closePeeks}
                  />
                </DetailPanel>
              </div>
            )}
            {peekTask && (
              <div
                className="timeline-peek"
                style={peekBox ? { right: peekBox.right, width: peekBox.width } : undefined}
              >
                {/* No panel header — the peek's own title line carries
                    the popup/close buttons, so nothing sits above it. */}
                <DetailPanel>
                  <TaskPeek
                    key={`${peekTask.itemId}:${peekTask.localEventId ?? 'own'}`}
                    itemId={peekTask.itemId}
                    localEventId={peekTask.localEventId ?? null}
                    onClose={closePeeks}
                    onOpenFull={() => openOverlay({ name: 'page', itemId: peekTask.itemId })}
                  />
                </DetailPanel>
              </div>
            )}
          </section>
        </div>
      </MeetingPeekProvider>
    </div>
  )
}

/** One upcoming day: a collapsible header, a drop target, its tasks. */
function DaySection({ day }: { day: RollingDay }): React.JSX.Element {
  const tasks = useLiveQuery(() => window.api.tasksFor(day.date), [day.date]) ?? []
  // Folded until asked for — the count pill on the header says what's
  // there without unpacking every day of the week.
  const [open, setOpen] = useState(false)
  // The quick-add shares the app-wide editing slot, so at most one
  // editor OR creator is ever open in the view — opening this collapses
  // any expanded card (and any other day's creator), and vice versa.
  const editing = useEditing()
  const addKey = `quickadd:${day.date}`
  const adding = editing.openId === addKey

  // The + always reveals the day and drops focus into the creator.
  const startAdd = (): void => {
    setOpen(true)
    editing.setOpenId(addKey)
  }
  const closeAdd = (): void => {
    if (editing.openId === addKey) editing.setOpenId(null)
  }

  return (
    <DropZone id={`list-${day.date}`} data={{ type: 'schedule', date: day.date }}>
      <div className="day-header">
        <button className="section-label day-toggle" onClick={() => setOpen(!open)}>
          {open ? '▾' : '▸'} {day.label}
          {!open && tasks.length > 0 && <span className="pill">{tasks.length}</span>}
        </button>
        <button className="day-add-btn" title={`Add a task on ${day.label}`} onClick={startAdd}>
          +
        </button>
      </div>
      {open && (
        <div>
          <DueStrip date={day.date} />
          {adding && <DayQuickAdd date={day.date} onClose={closeAdd} />}
          <TaskGroups items={tasks} date={day.date} />
          {tasks.length === 0 && !adding && (
            <span style={{ color: 'var(--text-faint)', fontSize: 14, padding: '2px 0 8px', display: 'block' }}>
              Nothing yet — drop a card here.
            </span>
          )}
        </div>
      )}
    </DropZone>
  )
}

/**
 * One upcoming week: the same collapsible group a day gets, but a
 * Monday–Sunday slice. Days the rolling window already shows keep
 * their own sections — this group picks up where the horizon ends —
 * while drops and quick-adds land on the week's Monday, the same date
 * the 'next wk' / 'wk after' scheduling buttons assign.
 */
function WeekSection({ week }: { week: UpcomingWeek }): React.JSX.Element {
  // The slice this group actually lists: everything in the week that
  // isn't already a DaySection above (late in a week, the 5-day window
  // reaches into next week).
  const lastRolling = rollingDays().at(-1)!.date
  const from = week.start > lastRolling ? week.start : ymdAddDays(lastRolling, 1)
  const tasks = useLiveQuery(() => window.api.tasksBetween(from, week.end), [from, week.end]) ?? []
  const [open, setOpen] = useState(false)
  const editing = useEditing()
  const addKey = `quickadd:${week.start}`
  const adding = editing.openId === addKey

  const startAdd = (): void => {
    setOpen(true)
    editing.setOpenId(addKey)
  }
  const closeAdd = (): void => {
    if (editing.openId === addKey) editing.setOpenId(null)
  }

  return (
    <DropZone id={`week-${week.start}`} data={{ type: 'schedule', date: week.start }}>
      <div className="day-header">
        <button className="section-label day-toggle" onClick={() => setOpen(!open)}>
          {open ? '▾' : '▸'} {week.label}
          {!open && tasks.length > 0 && <span className="pill">{tasks.length}</span>}
        </button>
        <button className="day-add-btn" title={`Add a task in ${week.label}`} onClick={startAdd}>
          +
        </button>
      </div>
      {open && (
        <div>
          {adding && <DayQuickAdd date={week.start} onClose={closeAdd} />}
          <TaskGroups items={tasks} date={week.start} showItemDates />
          {tasks.length === 0 && !adding && (
            <span style={{ color: 'var(--text-faint)', fontSize: 14, padding: '2px 0 8px', display: 'block' }}>
              Nothing yet — drop a card here.
            </span>
          )}
        </div>
      )}
    </DropZone>
  )
}

/**
 * Inline task creator scoped to one day: a title plus a project
 * dropdown, so you can file the task while you type it. Stays open
 * after each add (keeping the chosen project) for rapid entry; Esc or
 * ✕ closes it. Enter with an empty box also closes.
 */
function DayQuickAdd({ date, onClose }: { date: string; onClose: () => void }): React.JSX.Element {
  const mutate = useMutate()
  const [title, setTitle] = useState('')
  const [projectId, setProjectId] = useState<string | null>(null)

  const submit = async (): Promise<void> => {
    const t = title.trim()
    if (!t) {
      onClose()
      return
    }
    await mutate(() =>
      window.api.createItem({
        kind: 'task',
        title: t,
        status: 'active',
        scheduledDate: date,
        projectId,
        atTop: true
      })
    )
    setTitle('') // stay open for the next one; keep the chosen project
  }

  return (
    <div className="day-quick-add">
      <div className="day-quick-add-row">
        <input
          autoFocus
          placeholder="New task…"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit()
            if (e.key === 'Escape') onClose()
          }}
        />
        <button className="btn primary" onClick={submit} disabled={!title.trim()}>
          Add
        </button>
        <button className="btn ghost icon-btn" onClick={onClose} title="Done adding">
          ✕
        </button>
      </div>
      <ProjectPicker expanded value={projectId} onChange={setProjectId} />
    </div>
  )
}

/**
 * What's DUE by a day — distinct from what's scheduled on it. Quiet
 * pills inside each coming-up day's fold (the viewed day itself shows
 * no strip — deadlines surface on the task cards).
 */
function DueStrip({ date }: { date: string }): React.JSX.Element | null {
  const due = useLiveQuery(() => window.api.tasksDueOn(date), [date]) ?? []
  if (due.length === 0) return null
  return (
    <div className="row" style={{ flexWrap: 'wrap', gap: 6, margin: '2px 0 8px' }}>
      <span className="section-sublabel" style={{ marginTop: 0 }}>Due</span>
      {due.map((t) => (
        <span key={t.id} className="pill">
          {t.title}
        </span>
      ))}
    </div>
  )
}
