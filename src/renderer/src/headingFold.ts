/**
 * Which blocks a collapsed heading hides — the pure half of the
 * canvas's fold-a-section feature (the TipTap plugin in RichEditor
 * feeds it the document's top-level blocks and paints the result).
 *
 * A collapsed heading hides everything after it up to the next
 * heading of the same or a higher level. Folds nest: a collapsed H2
 * inside a collapsed H1's range stays hidden (and stays collapsed)
 * until the H1 opens.
 */
export interface FoldBlock {
  /** Heading level 1–6, or null for a non-heading block. */
  level: number | null
  collapsed: boolean
}

export interface FoldState {
  /** Indices of blocks that are hidden. */
  hidden: Set<number>
  /** Hidden block index → index of the collapsed heading hiding it. */
  controller: Map<number, number>
}

export function foldState(blocks: FoldBlock[]): FoldState {
  const hidden = new Set<number>()
  const controller = new Map<number, number>()
  let fold: { level: number; at: number } | null = null

  blocks.forEach((b, i) => {
    if (b.level !== null) {
      // A peer (or bigger) heading ends the running fold…
      if (fold && b.level <= fold.level) fold = null
      // …a smaller one inside it is just more hidden content.
      if (fold) {
        hidden.add(i)
        controller.set(i, fold.at)
        return
      }
      if (b.collapsed) fold = { level: b.level, at: i }
    } else if (fold) {
      hidden.add(i)
      controller.set(i, fold.at)
    }
  })

  return { hidden, controller }
}
