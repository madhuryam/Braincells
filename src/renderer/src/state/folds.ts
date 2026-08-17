import { useSyncExternalStore } from 'react'

/**
 * In-memory fold state for the day view's project blocks and the
 * sections inside them. It lives outside React on purpose: a block (or
 * section) you collapse stays collapsed as you navigate away and back,
 * because the store outlives the components that read it. It's just as
 * deliberately *not* persisted to disk — a reload starts everything
 * open again.
 *
 * Keys are namespaced strings the callers build, scoped by day so each
 * day folds independently (matching the per-day project blocks):
 *   `pg:<date>:<projectId|none>`               — a project block
 *   `sec:<date>:<projectId|none>:<sectionId|none>` — a section within it
 */
export interface FoldStore {
  isFolded(key: string): boolean
  toggle(key: string): void
  /** Unfold a single key; no-op (and no re-render) if already open. */
  unfold(key: string): void
  /** Fold or unfold many keys at once — the page's collapse-all/expand-all. */
  setMany(keys: string[], folded: boolean): void
  subscribe(listener: () => void): () => void
  getVersion(): number
}

export function createFoldStore(): FoldStore {
  const collapsed = new Set<string>()
  const listeners = new Set<() => void>()
  let version = 0

  const emit = (): void => {
    version += 1
    listeners.forEach((l) => l())
  }

  return {
    isFolded: (key) => collapsed.has(key),
    toggle: (key) => {
      if (collapsed.has(key)) collapsed.delete(key)
      else collapsed.add(key)
      emit()
    },
    unfold: (key) => {
      if (collapsed.delete(key)) emit()
    },
    setMany: (keys, folded) => {
      let changed = false
      for (const key of keys) {
        if (folded) {
          if (!collapsed.has(key)) {
            collapsed.add(key)
            changed = true
          }
        } else if (collapsed.delete(key)) {
          changed = true
        }
      }
      if (changed) emit()
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    getVersion: () => version
  }
}

/** The one store the whole day view shares. */
const store = createFoldStore()

/** Subscribe to fold changes and get the shared store back. */
export function useFolds(): FoldStore {
  useSyncExternalStore(store.subscribe, store.getVersion)
  return store
}
