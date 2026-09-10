import { BrowserWindow, ipcMain } from 'electron'
import type { CalendarEvent } from '../../shared/types'
import type { Store } from '../store'
import { autoFileMeetingsByLabel } from './classify'
import { demoEvents } from './demo'
import { withoutWorkLocationEvents } from './filter'
import { GoogleCalendar } from './google'

export type CalendarMode = 'demo' | 'google' | 'off'

/**
 * The calendar IPC surface. Whichever provider is active, events are
 * read live and never stored — but every fetch refreshes the
 * title/date snapshots on existing links (how reschedules propagate
 * to saved notes, SPEC §3) and files labeled meetings into their
 * label's associated project.
 */
// The renderer re-queries on every data mutation, so identical Google
// ranges get fetched seconds apart. Long enough to absorb those bursts,
// short enough that external calendar edits still show up quickly.
const GOOGLE_CACHE_TTL_MS = 45_000
// Bounds memory during long scrolling sessions (one entry per range).
const GOOGLE_CACHE_MAX_ENTRIES = 30
// After a failed fetch (offline, DNS down), don't hammer Google on
// every query burst — wait this long before the next attempt.
const GOOGLE_FAILURE_RETRY_MS = 15_000

export function registerCalendarIpc(store: Store): void {
  const google = new GoogleCalendar(store)
  // Raw (pre-filter) events per range — hideWorkLocation can flip
  // mid-TTL, so filtering happens after retrieval, never before caching.
  const googleCache = new Map<string, { events: CalendarEvent[]; fetchedAt: number }>()

  // The subscribed calendar plus, when configured, the separate
  // WRITABLE calendar ad-hoc meetings land on — merged into one
  // stream, ordered by start time, cached per range as one entry.
  const fetchAllCalendars = async (startDate: string, endDate: string): Promise<CalendarEvent[]> => {
    const writableId = store.getSetting<string>('writableCalendarId')
    const [primary, extra] = await Promise.all([
      google.eventsBetween(startDate, endDate),
      writableId && writableId !== 'primary'
        ? google.eventsBetween(startDate, endDate, writableId)
        : Promise.resolve([])
    ])
    return [...primary, ...extra].sort(
      (a, b) => a.date.localeCompare(b.date) || (a.startTime ?? '').localeCompare(b.startTime ?? '')
    )
  }

  const cachedGoogleEvents = async (startDate: string, endDate: string): Promise<CalendarEvent[]> => {
    const key = `${startDate}..${endDate}`
    const hit = googleCache.get(key)
    if (hit && Date.now() - hit.fetchedAt < GOOGLE_CACHE_TTL_MS) return hit.events
    let events: CalendarEvent[]
    try {
      events = await fetchAllCalendars(startDate, endDate)
    } catch (err) {
      // Offline (ENOTFOUND) or Google unreachable: stay quiet and
      // usable — show the last events this range had (or none), and
      // let the next query retry after a pause instead of erroring
      // out of the IPC handler on every burst.
      console.warn(
        `calendar: fetch failed for ${key} — serving last-known events.`,
        err instanceof Error ? err.message : err
      )
      const stale = hit?.events ?? []
      googleCache.delete(key)
      googleCache.set(key, {
        events: stale,
        // Backdated so the entry re-expires after the retry pause.
        fetchedAt: Date.now() - GOOGLE_CACHE_TTL_MS + GOOGLE_FAILURE_RETRY_MS
      })
      return stale
    }
    googleCache.delete(key) // re-insert so Map order stays oldest-first
    googleCache.set(key, { events, fetchedAt: Date.now() })
    for (const oldest of googleCache.keys()) {
      if (googleCache.size <= GOOGLE_CACHE_MAX_ENTRIES) break
      googleCache.delete(oldest)
    }
    return events
  }

  ipcMain.handle(
    'calendar:events',
    async (e, startDate: string, endDate: string): Promise<CalendarEvent[]> => {
      const mode = store.getSetting<CalendarMode>('calendarMode') ?? 'demo'
      let events: CalendarEvent[] = []
      if (mode === 'demo') {
        events = demoEvents(startDate, endDate)
      } else if (mode === 'google' && google.isConnected()) {
        events = await cachedGoogleEvents(startDate, endDate)
      }
      // Work-location noise ("Home"/"Office" all-day events) is filtered
      // here at the source, so every view benefits at once.
      if (store.getSetting<boolean>('hideWorkLocation')) {
        events = withoutWorkLocationEvents(events)
      }
      store.refreshEventSnapshots(events)
      // Filing only ever creates rows, so this converges: the refresh
      // it triggers re-fetches once, files nothing, and goes quiet.
      if (autoFileMeetingsByLabel(store, events) > 0) {
        e.sender.send('data-changed')
      }
      return events
    }
  )

  // "Sync now": forget every cached range, then nudge every window to
  // re-run its queries — the calendar ones come back to Google fresh.
  ipcMain.handle('calendar:syncNow', () => {
    googleCache.clear()
    for (const w of BrowserWindow.getAllWindows()) w.webContents.send('data-changed')
  })

  ipcMain.handle('calendar:googleStatus', () => ({ connected: google.isConnected() }))

  ipcMain.handle(
    'calendar:googleConnect',
    async (_e, clientId: string, clientSecret: string): Promise<{ ok: boolean; error?: string }> => {
      try {
        await google.connect({ clientId, clientSecret })
        googleCache.clear() // new account/mode — cached ranges are wrong
        store.setSetting('calendarMode', 'google')
        return { ok: true }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) }
      }
    }
  )

  ipcMain.handle('calendar:googleDisconnect', () => {
    google.disconnect()
    googleCache.clear()
    store.setSetting('calendarMode', 'demo')
  })

  // The account's calendars, for Settings' writable-calendar picker.
  // Only ones the account can write to are offered; primary is listed
  // but the renderer marks it un-pickable — the subscribed calendar
  // stays read-only by policy.
  ipcMain.handle('calendar:list', async () => {
    if (!google.isConnected()) return []
    try {
      return (await google.listCalendars()).filter(
        (c) => c.accessRole === 'owner' || c.accessRole === 'writer'
      )
    } catch (err) {
      console.warn('calendar: could not list calendars.', err instanceof Error ? err.message : err)
      return []
    }
  })

  // THE write guard. Every write (create, delete) passes through here:
  // the target must be the configured writable calendar, and that
  // calendar must verifiably NOT be the subscribed primary — checked
  // against Google's own calendar list, not just the setting string.
  const assertWritableTarget = async (): Promise<string> => {
    const writableId = store.getSetting<string>('writableCalendarId')
    if (!writableId) throw new Error('Pick a writable calendar in Settings first')
    const cal = (await google.listCalendars()).find((c) => c.id === writableId)
    if (!cal) throw new Error('The writable calendar was not found — re-pick it in Settings')
    if (cal.primary) throw new Error('The subscribed calendar is read-only — pick a separate one')
    return writableId
  }

  // Every window re-queries; the write must show up NOW, not when the
  // range's 45s cache expires.
  const flushAndNotify = (): void => {
    googleCache.clear()
    for (const w of BrowserWindow.getAllWindows()) w.webContents.send('data-changed')
  }

  // Create an ad-hoc meeting (a huddle, a call) on the writable
  // calendar. Never touches primary: without a configured writable
  // calendar this refuses rather than guessing.
  ipcMain.handle(
    'calendar:createEvent',
    async (
      _e,
      ev: { title: string; date: string; startTime: string; endTime: string }
    ): Promise<{ ok: boolean; error?: string; event?: CalendarEvent }> => {
      try {
        const writableId = await assertWritableTarget()
        const created = await google.createEvent(writableId, ev)
        flushAndNotify()
        return { ok: true, event: created ?? undefined }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) }
      }
    }
  )

  // Delete an ad-hoc meeting — from the WRITABLE calendar only. The
  // eventKey's id half names the event; the target calendar is always
  // the verified writable one, so a subscribed-calendar eventKey sent
  // here by mistake simply 404s on the wrong calendar instead of ever
  // touching the real event.
  ipcMain.handle(
    'calendar:deleteEvent',
    async (_e, eventKey: string): Promise<{ ok: boolean; error?: string }> => {
      try {
        const writableId = await assertWritableTarget()
        const eventId = eventKey.split('::')[0]
        await google.deleteEvent(writableId, eventId)
        flushAndNotify()
        return { ok: true }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) }
      }
    }
  )
}
