import { describe, expect, it } from 'vitest'
import { mapGoogleEvent, meetLinkOf, type RawGoogleEvent } from './map'

const base: RawGoogleEvent = {
  id: 'ev1',
  summary: 'Design review',
  start: { dateTime: '2026-08-18T10:00:00-04:00' },
  end: { dateTime: '2026-08-18T11:00:00-04:00' }
}

describe('mapGoogleEvent', () => {
  it('drops cancelled and startless events', () => {
    expect(mapGoogleEvent({ ...base, status: 'cancelled' })).toBeNull()
    expect(mapGoogleEvent({ id: 'x' })).toBeNull()
  })

  it('marks private events with a 🗝️ in the title', () => {
    expect(mapGoogleEvent({ ...base, visibility: 'private' })!.title).toBe('🗝️ Design review')
    expect(mapGoogleEvent({ ...base, visibility: 'confidential' })!.title).toBe('🗝️ Design review')
    expect(mapGoogleEvent(base)!.title).toBe('Design review')
    expect(mapGoogleEvent({ ...base, visibility: 'default' })!.title).toBe('Design review')
  })

  it('carries the description; blank becomes null', () => {
    expect(mapGoogleEvent({ ...base, description: 'Agenda: <b>ship it</b>' })!.description).toBe(
      'Agenda: <b>ship it</b>'
    )
    expect(mapGoogleEvent({ ...base, description: '  ' })!.description).toBeNull()
    expect(mapGoogleEvent(base)!.description).toBeNull()
  })
})

describe('meetLinkOf', () => {
  it('prefers hangoutLink, falls back to the conferenceData video entry point', () => {
    expect(meetLinkOf({ ...base, hangoutLink: 'https://meet.google.com/abc' })).toBe(
      'https://meet.google.com/abc'
    )
    expect(
      meetLinkOf({
        ...base,
        conferenceData: {
          entryPoints: [
            { entryPointType: 'phone', uri: 'tel:+1555' },
            { entryPointType: 'video', uri: 'https://zoom.us/j/123' }
          ]
        }
      })
    ).toBe('https://zoom.us/j/123')
    expect(meetLinkOf(base)).toBeNull()
  })
})
