import { useEffect, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faSquareCaretDown, faSquareCaretUp } from '@fortawesome/free-solid-svg-icons'
import { todayYmd, ymdAddDays } from '@shared/dates'
import type { CalendarEvent } from '@shared/types'
import { useLiveQuery, useMutate } from '../state/data'
import { useNav } from '../state/nav'
import { MeetingPeekProvider } from '../state/peek'
import { Card } from '../components/Card'
import { AllDayBar } from '../components/AllDayBar'
import { DetailPanel } from '../components/DetailPanel'
import { DoneList } from '../components/DoneList'
import { Meeting } from './Meeting'
import { BackButton, EmptyState } from '../components/bits'
import { ampm, longDate, mmdd } from '../format'

/**
 * The weekly log (SPEC §4.5): an automatic answer to "what did I even
 * do this week" — one collapsible block per day (journal, meetings,
 * done), a week at a time, or the whole week rolled into one cohesive
 * list. Clicking a meeting or item peeks it in a right-hand detail
 * panel instead of leaving the screen.
 *
 * This is a RECORD view, so done tasks render readable (no
 * strikethrough), and the header offers: by-day vs by-week, tasks-only
 * (hide projects that only show up because of meetings), and a
 * by-section split. All three remember themselves across sessions.
 */

/** What the detail panel is currently showing. (Done items expand in
 *  place like on Today, so only meetings peek here now.) */
type Detail = { kind: 'meeting'; eventKey: string; title: string; date: string }

/** Monday of the week containing `date`. */
function weekStartOf(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  const weekday = new Date(y, m - 1, d).getDay() // 0 = Sunday
  return ymdAddDays(date, -((weekday + 6) % 7))
}

function monthDay(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

/** A small on/off pill for the header's view options. */
function TogglePill({
  on,
  label,
  title,
  onToggle
}: {
  on: boolean
  label: string
  title: string
  onToggle: () => void
}): React.JSX.Element {
  return (
    <button className={`btn small ${on ? 'primary' : 'ghost'}`} title={title} onClick={onToggle}>
      {label}
    </button>
  )
}

export function DailyLog(): React.JSX.Element {
  const today = todayYmd()
  const [weekStart, setWeekStart] = useState(weekStartOf(today))
  const weekEnd = ymdAddDays(weekStart, 6)
  const days = Array.from({ length: 7 }, (_, i) => ymdAddDays(weekStart, i))
  const events =
    useLiveQuery(() => window.api.calendarEvents(weekStart, weekEnd), [weekStart]) ?? []

  // View options, remembered across sessions (settings, not just state).
  const [view, setView] = useState<'day' | 'week'>('day')
  const [tasksOnly, setTasksOnly] = useState(false)
  const [bySection, setBySection] = useState(false)
  useEffect(() => {
    window.api.getSetting<'day' | 'week'>('logView').then((v) => v === 'week' && setView('week'))
    window.api.getSetting<boolean>('logTasksOnly').then((v) => v === true && setTasksOnly(true))
    window.api.getSetting<boolean>('logBySection').then((v) => v === true && setBySection(true))
  }, [])
  const saveView = (v: 'day' | 'week'): void => {
    setView(v)
    void window.api.setSetting('logView', v)
  }
  const saveTasksOnly = (v: boolean): void => {
    setTasksOnly(v)
    void window.api.setSetting('logTasksOnly', v)
  }
  const saveBySection = (v: boolean): void => {
    setBySection(v)
    void window.api.setSetting('logBySection', v)
  }

  // Today starts open; every other day is a header until clicked.
  const [openDays, setOpenDays] = useState<Set<string>>(new Set([today]))
  const [detail, setDetail] = useState<Detail | null>(null)
  const { openOverlay } = useNav()

  const toggleDay = (d: string): void =>
    setOpenDays((prev) => {
      const next = new Set(prev)
      if (next.has(d)) next.delete(d)
      else next.add(d)
      return next
    })
  const allOpen = days.every((d) => openDays.has(d))

  return (
    // The width never changes when the panel opens — the log column
    // always lives in the left half, so peeking shifts nothing.
    <div className="canvas">
      <header className="canvas-header">
        <BackButton />
        <h1>Weekly Log</h1>
        <span className="date">
          {monthDay(weekStart)} – {monthDay(weekEnd)}
        </span>
        <span className="row" style={{ marginLeft: 'auto' }}>
          <button className="btn ghost" onClick={() => setWeekStart(ymdAddDays(weekStart, -7))}>
            ⬅
          </button>
          {weekStart !== weekStartOf(today) && (
            <button className="btn ghost" onClick={() => setWeekStart(weekStartOf(today))}>
              this week
            </button>
          )}
          <button
            className="btn ghost"
            disabled={weekStart === weekStartOf(today)}
            onClick={() => setWeekStart(ymdAddDays(weekStart, 7))}
          >
            ➡
          </button>
          {view === 'day' && (
            <button
              className="btn ghost icon-btn tooltip"
              data-tooltip={allOpen ? 'Collapse all days' : 'Expand all days'}
              onClick={() => setOpenDays(allOpen ? new Set() : new Set(days))}
            >
              <FontAwesomeIcon icon={allOpen ? faSquareCaretUp : faSquareCaretDown} />
            </button>
          )}
        </span>
      </header>

      {/* How to read the week: broken down by day, or one cohesive
          list; tasks-only and by-section shape both. */}
      <div className="row" style={{ margin: '0 0 14px', gap: 6 }}>
        <TogglePill on={view === 'day'} label="by day" title="One block per day" onToggle={() => saveView('day')} />
        <TogglePill
          on={view === 'week'}
          label="by week"
          title="Everything completed this week, in one list"
          onToggle={() => saveView('week')}
        />
        <span style={{ width: 10 }} aria-hidden />
        <TogglePill
          on={tasksOnly}
          label="tasks only"
          title="Hide projects that only show up because of meetings"
          onToggle={() => saveTasksOnly(!tasksOnly)}
        />
        <TogglePill
          on={bySection}
          label="by section"
          title="Split each project's done tasks under its section names"
          onToggle={() => saveBySection(!bySection)}
        />
      </div>

      {/* A task's 📅 meeting chip peeks that meeting in the right-hand
          panel — the same slot day-block clicks use. */}
      <MeetingPeekProvider
        onPeek={(m) => setDetail({ kind: 'meeting', eventKey: m.eventKey, title: m.title, date: m.date })}
      >
      <div className="log-split">
        <div className="log-main">
          {view === 'day' ? (
            days.map((d) => (
              <DayBlock
                key={d}
                date={d}
                isToday={d === today}
                open={openDays.has(d)}
                onToggle={() => toggleDay(d)}
                events={events.filter((e) => e.date === d)}
                onPeek={setDetail}
                tasksOnly={tasksOnly}
                bySection={bySection}
              />
            ))
          ) : (
            <WeekBlock
              days={days}
              events={events}
              onPeek={setDetail}
              tasksOnly={tasksOnly}
              bySection={bySection}
            />
          )}
        </div>

        {detail && (
          <DetailPanel
            title={detail.title}
            onOpenFull={() =>
              openOverlay({
                name: 'meeting',
                eventKey: detail.eventKey,
                title: detail.title,
                date: detail.date
              })
            }
            onClose={() => setDetail(null)}
          >
            <Meeting
              key={detail.eventKey}
              embedded
              eventKey={detail.eventKey}
              title={detail.title}
              date={detail.date}
            />
          </DetailPanel>
        )}
      </div>
      </MeetingPeekProvider>
    </div>
  )
}

function DayBlock({
  date,
  isToday,
  open,
  onToggle,
  events,
  onPeek,
  tasksOnly,
  bySection
}: {
  date: string
  isToday: boolean
  open: boolean
  onToggle: () => void
  events: CalendarEvent[]
  onPeek: (d: Detail) => void
  tasksOnly: boolean
  bySection: boolean
}): React.JSX.Element {
  const completed = useLiveQuery(() => window.api.completedOn(date), [date]) ?? []

  return (
    <section>
      <button className="section-label day-toggle" onClick={onToggle}>
        {open ? '▾' : '▸'} {isToday ? 'today · ' : ''}
        {longDate(date)}
        {events.length > 0 && <span className="pill">📅 {events.length}</span>}
        {completed.length > 0 && <span className="pill">✓ {completed.length}</span>}
      </button>

      {open && (
        <div className="stack day-content">
          <DayJournal date={date} />

          {events.length === 0 && completed.length === 0 && (
            <EmptyState art="🗒️">N o n e</EmptyState>
          )}

          <AllDayBar events={events} />
          {/* Done left, meetings right — "what you did" reads separately
              from "where you were". Empty .item-list divs hide via :empty. */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }}>
            <div className="stack">
              <span className="section-sublabel">Done</span>
              {/* The same element as Today's Done section — full cards,
                  subtask lineage grouped under each parent, checkboxes
                  uncheckable in place. Plain (no strikethrough): this
                  is a record to read, not a list to dismiss. */}
              <DoneList
                date={date}
                plain
                collapsible
                hideMeetingOnly={tasksOnly}
                bySection={bySection}
              />
            </div>

            <div className="stack">
              <span className="section-sublabel">Meetings</span>
              {/* Rows in one container, not a stack of cards — same calm
                  treatment as the task lists. */}
              <div className="item-list">
                {events.filter((ev) => ev.startTime).map((ev) => (
                  <Card
                    key={ev.eventKey}
                    interactive
                    onClick={() =>
                      onPeek({ kind: 'meeting', eventKey: ev.eventKey, title: ev.title, date: ev.date })
                    }
                  >
                    <div className="row">
                      <span className="meeting-time">{ampm(ev.startTime!)}</span>
                      <span className="card-title">{ev.title}</span>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

/**
 * The whole week as one cohesive record: everything completed across
 * the seven days in a single grouped list (each project once), the
 * week's meetings beside it in day order.
 */
function WeekBlock({
  days,
  events,
  onPeek,
  tasksOnly,
  bySection
}: {
  days: string[]
  events: CalendarEvent[]
  onPeek: (d: Detail) => void
  tasksOnly: boolean
  bySection: boolean
}): React.JSX.Element {
  const timed = events.filter((ev) => ev.startTime)
  return (
    <section>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }}>
        <div className="stack">
          <span className="section-sublabel">Done this week</span>
          <DoneList
            dates={days}
            plain
            collapsible
            hideMeetingOnly={tasksOnly}
            bySection={bySection}
          />
        </div>

        <div className="stack">
          <span className="section-sublabel">Meetings</span>
          <div className="item-list">
            {timed.map((ev) => (
              <Card
                key={ev.eventKey}
                interactive
                onClick={() =>
                  onPeek({ kind: 'meeting', eventKey: ev.eventKey, title: ev.title, date: ev.date })
                }
              >
                <div className="row">
                  <span className="meeting-date">{mmdd(ev.date)}</span>
                  <span className="meeting-time">{ampm(ev.startTime!)}</span>
                  <span className="card-title">{ev.title}</span>
                </div>
              </Card>
            ))}
            {timed.length === 0 && (
              <span style={{ color: 'var(--text-faint)', fontSize: 14 }}>no meetings this week</span>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

/**
 * Mounted only while its day is expanded — journalFor() creates the
 * day's journal item on first access, and collapsed days shouldn't
 * spawn seven empty journals a week.
 */
function DayJournal({ date }: { date: string }): React.JSX.Element {
  const journal = useLiveQuery(() => window.api.journalFor(date), [date])
  const mutate = useMutate()
  const [text, setText] = useState('')
  useEffect(() => setText(journal?.content ?? ''), [journal?.id])

  const save = (): void => {
    if (journal && text !== journal.content) {
      mutate(() => window.api.updateItem(journal.id, { content: text }))
    }
  }

  return (
    <textarea
      rows={3}
      style={{ width: '100%', resize: 'vertical' }}
      placeholder="Free-form. How did the day actually go?"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={save}
    />
  )
}
