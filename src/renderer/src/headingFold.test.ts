import { describe, expect, it } from 'vitest'
import { foldState, type FoldBlock } from './headingFold'

const h = (level: number, collapsed = false): FoldBlock => ({ level, collapsed })
const p = (): FoldBlock => ({ level: null, collapsed: false })

describe('foldState (collapsed headings → hidden blocks)', () => {
  it('hides nothing when nothing is collapsed', () => {
    const { hidden } = foldState([h(1), p(), h(2), p(), p()])
    expect(hidden.size).toBe(0)
  })

  it('a collapsed heading hides its section up to the next peer heading', () => {
    // 0:H1(folded) 1:p 2:p 3:H1 4:p
    const { hidden, controller } = foldState([h(1, true), p(), p(), h(1), p()])
    expect([...hidden].sort()).toEqual([1, 2])
    expect(controller.get(1)).toBe(0)
    expect(controller.get(2)).toBe(0)
  })

  it('a bigger heading also ends a smaller fold', () => {
    // 0:H2(folded) 1:p 2:H1 3:p — the H1 outranks the folded H2.
    const { hidden } = foldState([h(2, true), p(), h(1), p()])
    expect([...hidden]).toEqual([1])
  })

  it('a collapsed section swallows its subsections', () => {
    // 0:H1(folded) 1:p 2:H2 3:p 4:H1 5:p
    const { hidden, controller } = foldState([h(1, true), p(), h(2), p(), h(1), p()])
    expect([...hidden].sort()).toEqual([1, 2, 3])
    // Every hidden block answers to the H1, including the H2 heading.
    expect(controller.get(2)).toBe(0)
    expect(controller.get(3)).toBe(0)
  })

  it('folds nest: a hidden collapsed H2 stays subordinate to its H1', () => {
    // 0:H1(folded) 1:H2(folded) 2:p — expanding the H1 must be step 1;
    // block 2 reports the H1 as its controller while the H1 is folded.
    const first = foldState([h(1, true), h(2, true), p()])
    expect(first.controller.get(2)).toBe(0)
    // After the H1 opens, the same block answers to the H2.
    const second = foldState([h(1), h(2, true), p()])
    expect([...second.hidden]).toEqual([2])
    expect(second.controller.get(2)).toBe(1)
  })

  it('content before the first heading is never hidden', () => {
    const { hidden } = foldState([p(), p(), h(1, true), p()])
    expect([...hidden]).toEqual([3])
  })

  it('a collapsed heading with an empty section hides nothing', () => {
    const { hidden } = foldState([h(1, true), h(1), p()])
    expect(hidden.size).toBe(0)
  })
})
