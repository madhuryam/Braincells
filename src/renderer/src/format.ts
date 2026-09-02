import { mondayOfWeek, todayYmd, ymdAddDays } from '@shared/dates'
import type { Project } from '@shared/types'

/** What tight spots (pills, chips) call a project: its nickname when
 *  one is set, the full name otherwise. Full-name surfaces (sidebar,
 *  Projects page, project headers) don't use this. */
export function projectLabel(p: Project): string {
  return p.nickname?.trim() || p.name
}

/** 'today' / 'tomorrow' / 'yesterday' / 'Jun 12' — for date pills. */
export function prettyDate(date: string): string {
  const today = todayYmd()
  if (date === today) return 'today'
  if (date === ymdAddDays(today, 1)) return 'tomorrow'
  if (date === ymdAddDays(today, -1)) return 'yesterday'
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

/** '06/12' — compact fixed-width date for dense rows. */
export function mmdd(date: string): string {
  return `${date.slice(5, 7)}/${date.slice(8, 10)}`
}

/** 'Thursday, June 12' — for screen headers. */
export function longDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric'
  })
}

export function weekdayName(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'long' })
}

export interface RollingDay {
  date: string
  /** Group headers: 'today · Friday, June 13', 'tomorrow · Saturday, June 14', then 'Sunday, June 15'. */
  label: string
  /** Compact form for chips/keys: 'today', 'tmrw', 'Wed'… */
  chip: string
}

/**
 * The scheduling vocabulary: a 5-day rolling window starting today,
 * and beyond that whole weeks — 'next week' and 'the week after',
 * which both mean that week's Monday. Deliberately no date picker
 * required — seven buttons cover the planning horizon.
 */
export function rollingDays(count = 5): RollingDay[] {
  const today = todayYmd()
  return Array.from({ length: count }, (_, i) => {
    const date = ymdAddDays(today, i)
    const [y, m, d] = date.split('-').map(Number)
    const full = new Date(y, m - 1, d).toLocaleDateString(undefined, {
      weekday: 'long',
      month: 'long',
      day: 'numeric'
    })
    const weekday = full.split(',')[0]
    return {
      date,
      label: i === 0 ? `today · ${full}` : i === 1 ? `tomorrow · ${full}` : full,
      chip: i === 0 ? 'today' : i === 1 ? 'tmrw' : weekday.slice(0, 3)
    }
  })
}

export interface UpcomingWeek {
  /** The week's Monday — what 'move it to this week' assigns. */
  start: string
  /** The week's Sunday. */
  end: string
  /** Section headers: 'Next week · Sep 7–13'. */
  label: string
  /** Compact form for scheduling buttons: 'next wk', 'wk after'. */
  chip: string
}

/** 'Sep 7–13', or 'Sep 28 – Oct 4' when the week straddles months. */
function weekRange(start: string, end: string): string {
  const fmt = (date: string, day = true): string => {
    const [y, m, d] = date.split('-').map(Number)
    return new Date(y, m - 1, d).toLocaleDateString(undefined, {
      month: 'short',
      ...(day ? { day: 'numeric' } : {})
    })
  }
  return start.slice(0, 7) === end.slice(0, 7)
    ? `${fmt(start)}–${end.slice(8, 10).replace(/^0/, '')}`
    : `${fmt(start)} – ${fmt(end)}`
}

/**
 * Past the 5-day window the vocabulary coarsens to whole weeks: next
 * week and the week after, each pinned to its Monday. The Coming up
 * section renders one group per week; the scheduling buttons assign
 * the Monday.
 */
export function upcomingWeeks(): UpcomingWeek[] {
  const today = todayYmd()
  return [1, 2].map((weeksAhead) => {
    const start = mondayOfWeek(today, weeksAhead)
    const end = ymdAddDays(start, 6)
    return {
      start,
      end,
      label: `${weeksAhead === 1 ? 'Next week' : 'Week after next'} · ${weekRange(start, end)}`,
      chip: weeksAhead === 1 ? 'next wk' : 'wk after'
    }
  })
}

/** '14:30' → '2:30 PM'; '09:00' → '9 AM'. All displayed times are 12-hour. */
export function ampm(time: string): string {
  const [h, m] = time.split(':').map(Number)
  const suffix = h < 12 ? 'AM' : 'PM'
  const hour = h % 12 === 0 ? 12 : h % 12
  return m ? `${hour}:${String(m).padStart(2, '0')} ${suffix}` : `${hour} ${suffix}`
}

/** '45m', '1h', '1h 15m' — totals of time blocked on the calendar. */
export function durationLabel(mins: number): string {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return h === 0 ? `${m}m` : m === 0 ? `${h}h` : `${h}h ${m}m`
}

export const KIND_ICON: Record<string, string> = {
  task: '✓', // quiet check — the green ✅ shouted from every list
  note: '📝',
  journal: '📓',
  prep: '🎯',
  page: '📄'
}
