import { describe, expect, it } from 'vitest'
import { chimeScheduleLabel, inChimeWindow, msUntilNextChime } from './chime'

const at = (m: number, s = 0, ms = 0): Date => new Date(2026, 7, 18, 10, m, s, ms)

describe('msUntilNextChime', () => {
  it('counts down to the next quarter-hour boundary', () => {
    expect(msUntilNextChime(at(7), 15)).toBe(8 * 60_000)
    expect(msUntilNextChime(at(14, 59, 900), 15)).toBe(100)
  })

  it('waits a full period when sitting exactly on a boundary (no double fire)', () => {
    expect(msUntilNextChime(at(15), 15)).toBe(15 * 60_000)
    expect(msUntilNextChime(at(0), 15)).toBe(15 * 60_000)
  })

  it('aligns to the top of the hour for a 60-minute interval', () => {
    expect(msUntilNextChime(at(59, 59, 500), 60)).toBe(500)
    expect(msUntilNextChime(at(0), 60)).toBe(60 * 60_000)
  })

  it('handles short intervals mid-slot', () => {
    expect(msUntilNextChime(at(3, 30), 5)).toBe(90_000)
  })
})

describe('inChimeWindow', () => {
  const clock = (h: number, m = 0): Date => new Date(2026, 7, 18, h, m)

  it('rings inside the window, including both bookends', () => {
    expect(inChimeWindow(clock(7), 7, 17)).toBe(true)
    expect(inChimeWindow(clock(12, 30), 7, 17)).toBe(true)
    expect(inChimeWindow(clock(17), 7, 17)).toBe(true)
  })

  it('stays silent outside it', () => {
    expect(inChimeWindow(clock(6, 45), 7, 17)).toBe(false)
    expect(inChimeWindow(clock(17, 15), 7, 17)).toBe(false)
    expect(inChimeWindow(clock(23), 7, 17)).toBe(false)
  })

  it('0–24 means all day', () => {
    expect(inChimeWindow(clock(0), 0, 24)).toBe(true)
    expect(inChimeWindow(clock(23, 45), 0, 24)).toBe(true)
  })
})

describe('chimeScheduleLabel', () => {
  it('names the clock minutes for the picked interval', () => {
    expect(chimeScheduleLabel(15)).toBe('at :00, :15, :30 and :45')
    expect(chimeScheduleLabel(20)).toBe('at :00, :20 and :40')
    expect(chimeScheduleLabel(30)).toBe('at :00 and :30')
    expect(chimeScheduleLabel(60)).toBe('at the top of each hour')
    expect(chimeScheduleLabel(5)).toBe('every 5 minutes on the clock')
  })
})
