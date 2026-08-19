import { eventKeyOf, type CalendarEvent } from '../../shared/types'
import { hhmm, ymd } from '../../shared/dates'

/** The subset of a Google events.list item the app reads. */
export interface RawGoogleEvent {
  id: string
  status?: string
  summary?: string
  description?: string
  /** 'default' | 'public' | 'private' | 'confidential' */
  visibility?: string
  /** The Meet join URL Google sets on plain Meet events. */
  hangoutLink?: string
  /** Structured conference info — covers non-Meet providers (Zoom
   *  etc.) attached via conferencing add-ons. */
  conferenceData?: { entryPoints?: Array<{ entryPointType?: string; uri?: string }> }
  colorId?: string
  eventLabelId?: string
  start?: { dateTime?: string; date?: string }
  end?: { dateTime?: string; date?: string }
  attendees?: Array<{ self?: boolean; responseStatus?: string }>
}

/**
 * The joinable call URL, if any. hangoutLink is Meet's shortcut field;
 * conferenceData's video entry point is the general form. (htmlLink is
 * deliberately not a fallback — it opens the event's page in Google
 * Calendar's web UI, not the call.)
 */
export function meetLinkOf(e: RawGoogleEvent): string | null {
  if (e.hangoutLink) return e.hangoutLink
  const video = e.conferenceData?.entryPoints?.find((p) => p.entryPointType === 'video')
  return video?.uri ?? null
}

/**
 * One raw Google event → the app's CalendarEvent, or null for the ones
 * that never render (cancelled, or missing a start). Private events
 * wear a 🗝️ in the title itself, so every surface that shows the
 * title — timeline, month chips, pickers, snapshots — says so for free.
 */
export function mapGoogleEvent(e: RawGoogleEvent): CalendarEvent | null {
  if (e.status === 'cancelled' || !e.start) return null
  const startsAt = e.start.dateTime ? new Date(e.start.dateTime) : null
  const date = startsAt ? ymd(startsAt) : e.start.date
  if (!date) return null
  const lock = e.visibility === 'private' || e.visibility === 'confidential' ? '🗝️ ' : ''
  return {
    // Google event ids persist across edits and reschedules, which
    // is what lets links survive (SPEC §3).
    eventKey: eventKeyOf(e.id, date),
    title: lock + (e.summary ?? '(untitled)'),
    date,
    startTime: startsAt ? hhmm(startsAt) : null,
    endTime: e.end?.dateTime ? hhmm(new Date(e.end.dateTime)) : null,
    colorId: e.colorId ?? null,
    // Lowercased so a label's id is one key regardless of the
    // casing Google happens to return per event.
    eventLabelId: e.eventLabelId ? e.eventLabelId.toLowerCase() : null,
    description: e.description?.trim() ? e.description : null,
    meetLink: meetLinkOf(e)
  }
}
