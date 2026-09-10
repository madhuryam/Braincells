import { createServer, type Server } from 'node:http'
import { createHash, randomBytes } from 'node:crypto'
import { shell } from 'electron'
import type { CalendarEvent } from '../../shared/types'
import { isDeclinedByMe } from './filter'
import { mapGoogleEvent, type RawGoogleEvent } from './map'
import type { Store } from '../store'

/**
 * Read-only Google Calendar access (SPEC §8), no SDK — just the two
 * documented endpoints over fetch:
 *
 * 1. OAuth happens in the system browser. We start a one-shot local
 *    HTTP server on a random port, open Google's consent page with
 *    PKCE, and Google redirects back to http://127.0.0.1:<port> with
 *    a code we exchange for tokens. This is Google's recommended flow
 *    for desktop apps; the user supplies their own OAuth client
 *    (a "Desktop app" credential from console.cloud.google.com).
 * 2. Events come from the standard /calendar/v3 list endpoint with
 *    singleEvents=true, so recurring meetings arrive as individual
 *    occurrences — matching the per-occurrence notes decision
 *    (SPEC §10). Tokens live in the local settings table.
 */

interface GoogleTokens {
  accessToken: string
  refreshToken: string
  /** Epoch ms when accessToken expires. */
  expiresAt: number
}

interface GoogleClient {
  clientId: string
  clientSecret: string
}

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const API = 'https://www.googleapis.com/calendar/v3'
// Reading stays effectively read-only in spirit: the app never writes
// to the subscribed (primary) calendar. The events scope exists ONLY
// so ad-hoc meetings can land on the separate writable calendar picked
// in Settings. Connections made before this scope existed must be
// disconnected and reconnected once to grant it.
const SCOPE =
  'https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/calendar.events'

/** One row of the user's calendar list — enough to pick a writable one. */
export interface GoogleCalendarInfo {
  id: string
  summary: string
  primary: boolean
  /** 'owner' | 'writer' | 'reader' | 'freeBusyReader' */
  accessRole: string
}

export class GoogleCalendar {
  constructor(private store: Store) {}

  isConnected(): boolean {
    return this.store.getSetting<GoogleTokens>('googleTokens') !== null
  }

  disconnect(): void {
    this.store.setSetting('googleTokens', null)
  }

  /** Runs the full browser consent flow and stores the tokens. */
  async connect(client: GoogleClient): Promise<void> {
    const verifier = randomBytes(32).toString('base64url')
    const challenge = createHash('sha256').update(verifier).digest('base64url')

    const { server, port } = await listenOnLoopback()
    try {
      const redirectUri = `http://127.0.0.1:${port}`
      const params = new URLSearchParams({
        client_id: client.clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: SCOPE,
        access_type: 'offline', // we need a refresh token
        prompt: 'consent',
        code_challenge: challenge,
        code_challenge_method: 'S256'
      })
      shell.openExternal(`${AUTH_URL}?${params}`)

      const code = await waitForCode(server)
      const tokens = await postForm<TokenResponse>(TOKEN_URL, {
        code,
        client_id: client.clientId,
        client_secret: client.clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
        code_verifier: verifier
      })
      if (!tokens.refresh_token) throw new Error('Google did not return a refresh token')

      this.store.setSetting('googleClient', client)
      this.saveTokens(tokens, tokens.refresh_token)
    } finally {
      server.close()
    }
  }

  async eventsBetween(
    startDate: string,
    endDate: string,
    calendarId = 'primary'
  ): Promise<CalendarEvent[]> {
    const accessToken = await this.freshAccessToken()
    const events: CalendarEvent[] = []
    // Wide ranges (the scrolling calendar asks for months at a time)
    // can exceed one page — follow nextPageToken to the end.
    let pageToken: string | undefined
    do {
      const params = new URLSearchParams({
        timeMin: localDayStart(startDate).toISOString(),
        timeMax: localDayStart(endDate, /* nextDay */ true).toISOString(),
        singleEvents: 'true',
        orderBy: 'startTime',
        maxResults: '250'
      })
      if (pageToken) params.set('pageToken', pageToken)
      const res = await fetch(
        `${API}/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      )
      if (!res.ok) throw new Error(`Google Calendar: ${res.status} ${await res.text()}`)
      const body = (await res.json()) as {
        nextPageToken?: string
        items?: RawGoogleEvent[]
      }

      for (const e of body.items ?? []) {
        if (isDeclinedByMe(e.attendees)) continue
        const mapped = mapGoogleEvent(e)
        // Secondary-calendar events carry their source id — the marker
        // that lets the UI offer in-app deletion (primary never gets it).
        if (mapped) events.push(calendarId === 'primary' ? mapped : { ...mapped, calendarId })
      }
      pageToken = body.nextPageToken
    } while (pageToken)
    return events
  }

  /** The account's calendars — Settings offers the writable ones. */
  async listCalendars(): Promise<GoogleCalendarInfo[]> {
    const accessToken = await this.freshAccessToken()
    const res = await fetch(`${API}/users/me/calendarList?maxResults=250`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    })
    if (!res.ok) throw new Error(`Google Calendar: ${res.status} ${await res.text()}`)
    const body = (await res.json()) as {
      items?: Array<{ id: string; summary?: string; primary?: boolean; accessRole?: string }>
    }
    return (body.items ?? []).map((c) => ({
      id: c.id,
      summary: c.summary ?? c.id,
      primary: Boolean(c.primary),
      accessRole: c.accessRole ?? 'reader'
    }))
  }

  /**
   * Create an ad-hoc event (a huddle, a phone call) on ONE calendar —
   * always the designated writable one, never primary (the caller
   * enforces that; this method just writes where it's told). Returns
   * the created event mapped like any fetched one, so prep/notes/
   * follow-ups attach to it immediately.
   */
  async createEvent(
    calendarId: string,
    ev: { title: string; date: string; startTime: string; endTime: string }
  ): Promise<CalendarEvent | null> {
    const accessToken = await this.freshAccessToken()
    const at = (time: string): string => localDateTime(ev.date, time).toISOString()
    const res = await fetch(`${API}/calendars/${encodeURIComponent(calendarId)}/events`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        summary: ev.title,
        start: { dateTime: at(ev.startTime) },
        end: { dateTime: at(ev.endTime) }
      })
    })
    if (!res.ok) throw new Error(`Google Calendar: ${res.status} ${await res.text()}`)
    const mapped = mapGoogleEvent((await res.json()) as RawGoogleEvent)
    return mapped ? { ...mapped, calendarId } : null
  }

  /** Delete one event from ONE calendar — same rule as createEvent:
   *  the caller has already verified this is the writable calendar. */
  async deleteEvent(calendarId: string, eventId: string): Promise<void> {
    const accessToken = await this.freshAccessToken()
    const res = await fetch(
      `${API}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
      { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } }
    )
    // 410 = already gone — deleting twice is not an error.
    if (!res.ok && res.status !== 410)
      throw new Error(`Google Calendar: ${res.status} ${await res.text()}`)
  }

  private saveTokens(t: TokenResponse, refreshToken: string): void {
    this.store.setSetting('googleTokens', {
      accessToken: t.access_token,
      refreshToken,
      expiresAt: Date.now() + (t.expires_in - 60) * 1000 // refresh a minute early
    } satisfies GoogleTokens)
  }

  private async freshAccessToken(): Promise<string> {
    const tokens = this.store.getSetting<GoogleTokens>('googleTokens')
    const client = this.store.getSetting<GoogleClient>('googleClient')
    if (!tokens || !client) throw new Error('Google Calendar is not connected')
    if (Date.now() < tokens.expiresAt) return tokens.accessToken

    const refreshed = await postForm<TokenResponse>(TOKEN_URL, {
      client_id: client.clientId,
      client_secret: client.clientSecret,
      refresh_token: tokens.refreshToken,
      grant_type: 'refresh_token'
    })
    this.saveTokens(refreshed, tokens.refreshToken)
    return refreshed.access_token
  }
}

interface TokenResponse {
  access_token: string
  expires_in: number
  refresh_token?: string
}

async function postForm<T>(url: string, form: Record<string, string>): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(form)
  })
  if (!res.ok) throw new Error(`${url}: ${res.status} ${await res.text()}`)
  return (await res.json()) as T
}

function listenOnLoopback(): Promise<{ server: Server; port: number }> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (address && typeof address === 'object') resolve({ server, port: address.port })
      else reject(new Error('could not bind loopback port'))
    })
  })
}

/** Waits (up to 5 minutes) for Google to redirect back with ?code=. */
function waitForCode(server: Server): Promise<string> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Sign-in timed out')), 5 * 60_000)
    server.on('request', (req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1')
      const code = url.searchParams.get('code')
      const error = url.searchParams.get('error')
      if (!code && !error) {
        res.writeHead(404).end()
        return
      }
      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end('<body style="font-family:sans-serif"><h2>braincells is connected 🎉</h2>You can close this tab.</body>')
      clearTimeout(timeout)
      if (code) resolve(code)
      else reject(new Error(`Google sign-in failed: ${error}`))
    })
  })
}

/** Midnight local time for a YYYY-MM-DD (optionally the following midnight). */
function localDayStart(date: string, nextDay = false): Date {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y, m - 1, d + (nextDay ? 1 : 0))
}

/** Local wall-clock date+time ('2026-09-09', '14:30') as a Date. */
function localDateTime(date: string, time: string): Date {
  const [y, m, d] = date.split('-').map(Number)
  const [hh, mm] = time.split(':').map(Number)
  return new Date(y, m - 1, d, hh, mm)
}
