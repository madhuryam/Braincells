import { describe, expect, it } from 'vitest'
import { mondayOfWeek, ymdAddDays } from './dates'

describe('mondayOfWeek', () => {
  it('finds the Monday of the current week from any weekday', () => {
    expect(mondayOfWeek('2026-09-01')).toBe('2026-08-31') // Tuesday
    expect(mondayOfWeek('2026-08-31')).toBe('2026-08-31') // Monday itself
    expect(mondayOfWeek('2026-09-06')).toBe('2026-08-31') // Sunday closes the week
  })

  it('steps forward in whole weeks', () => {
    expect(mondayOfWeek('2026-09-01', 1)).toBe('2026-09-07')
    expect(mondayOfWeek('2026-09-01', 2)).toBe('2026-09-14')
    // From a Monday, "next week" is a clean 7 days out.
    expect(mondayOfWeek('2026-08-31', 1)).toBe('2026-09-07')
    // From a Sunday, "next week" starts tomorrow.
    expect(mondayOfWeek('2026-09-06', 1)).toBe('2026-09-07')
  })

  it('crosses month and year boundaries', () => {
    expect(mondayOfWeek('2026-01-01', 0)).toBe('2025-12-29')
    expect(mondayOfWeek('2026-12-31', 1)).toBe('2027-01-04')
  })

  it('agrees with ymdAddDays arithmetic', () => {
    const monday = mondayOfWeek('2026-09-03', 1)
    expect(monday).toBe(ymdAddDays(mondayOfWeek('2026-09-03', 0), 7))
  })
})
