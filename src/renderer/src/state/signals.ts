import { useLiveQuery } from './data'

/**
 * The signal map, keyed by TOP-LEVEL task: every signaled item (five
 * at most) resolved up to its outermost ancestor, keeping the loudest
 * priority when several land on one root. A deep subtask's signal
 * thereby lifts its whole card to the top of its subsection — without
 * the parent itself being highlighted.
 */
export function useSignalRoots(): Map<string, number> | undefined {
  return useLiveQuery(async () => {
    const sigs = await window.api.signalItems()
    const entries = await Promise.all(
      sigs.map(async (s) => {
        const ancestors = await window.api.ancestorsOf(s.id)
        return [ancestors[0]?.id ?? s.id, s.signalPriority!] as const
      })
    )
    const map = new Map<string, number>()
    for (const [rootId, priority] of entries) {
      map.set(rootId, Math.min(map.get(rootId) ?? 9, priority))
    }
    return map
  }, [])
}

/** Sort a slice signals-first (loudest leading), otherwise stable. */
export function signalsFirst<T extends { id: string }>(
  list: T[],
  roots: Map<string, number> | undefined
): T[] {
  if (!roots || roots.size === 0) return list
  return [...list].sort((a, b) => (roots.get(a.id) ?? 9) - (roots.get(b.id) ?? 9))
}
