import { describe, expect, it, vi } from 'vitest'
import { createFoldStore } from './folds'

describe('createFoldStore', () => {
  it('starts with everything open', () => {
    const s = createFoldStore()
    expect(s.isFolded('pg:2026-08-17:abc')).toBe(false)
  })

  it('toggles a single key on and off', () => {
    const s = createFoldStore()
    s.toggle('sec:2026-08-17:abc:s1')
    expect(s.isFolded('sec:2026-08-17:abc:s1')).toBe(true)
    s.toggle('sec:2026-08-17:abc:s1')
    expect(s.isFolded('sec:2026-08-17:abc:s1')).toBe(false)
  })

  it('folds project blocks and sections independently by key', () => {
    const s = createFoldStore()
    s.toggle('pg:2026-08-17:abc')
    // A section key that shares the project id is untouched.
    expect(s.isFolded('pg:2026-08-17:abc')).toBe(true)
    expect(s.isFolded('sec:2026-08-17:abc:s1')).toBe(false)
  })

  it('collapse-all/expand-all sets many keys at once', () => {
    const s = createFoldStore()
    const keys = ['pg:2026-08-17:a', 'pg:2026-08-17:b', 'pg:2026-08-17:none']
    s.setMany(keys, true)
    expect(keys.every((k) => s.isFolded(k))).toBe(true)
    s.setMany(keys, false)
    expect(keys.some((k) => s.isFolded(k))).toBe(false)
  })

  it('unfold only re-renders when it actually opens something', () => {
    const s = createFoldStore()
    const listener = vi.fn()
    s.subscribe(listener)
    s.unfold('pg:2026-08-17:abc') // already open — no change, no emit
    expect(listener).not.toHaveBeenCalled()
    s.toggle('pg:2026-08-17:abc')
    s.unfold('pg:2026-08-17:abc') // now it opens
    expect(s.isFolded('pg:2026-08-17:abc')).toBe(false)
    expect(listener).toHaveBeenCalledTimes(2) // toggle + unfold
  })

  it('notifies subscribers on change and stops after unsubscribe', () => {
    const s = createFoldStore()
    const listener = vi.fn()
    const unsub = s.subscribe(listener)
    s.toggle('pg:2026-08-17:a')
    expect(listener).toHaveBeenCalledTimes(1)
    expect(s.getVersion()).toBe(1)
    unsub()
    s.toggle('pg:2026-08-17:a')
    expect(listener).toHaveBeenCalledTimes(1) // no further calls
  })

  it('setMany with no effective change does not emit', () => {
    const s = createFoldStore()
    const listener = vi.fn()
    s.subscribe(listener)
    s.setMany(['pg:2026-08-17:a'], false) // already open
    expect(listener).not.toHaveBeenCalled()
  })
})
