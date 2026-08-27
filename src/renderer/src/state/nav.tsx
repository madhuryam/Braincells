import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'

/**
 * Client-side "routing" without a router: a handful of screens behind
 * a single switch — but with a history stack, so opening a meeting
 * from a project page (or notes from the daily log) can go *back* to
 * where you were, and *forward* again after going back.
 */
export type View =
  | { name: 'today' }
  | { name: 'projects' }
  | { name: 'project'; projectId: string }
  | { name: 'meeting'; eventKey: string; title: string; date: string }
  | { name: 'calendar' }
  | { name: 'page'; itemId: string }
  | { name: 'log' }
  | { name: 'search' }
  | { name: 'settings' }

interface NavContextValue {
  view: View
  /** A screen floated over the current one ("open full page"). */
  overlay: View | null
  navigate: (v: View) => void
  openOverlay: (v: View) => void
  closeOverlay: () => void
  back: () => void
  forward: () => void
  canGoBack: boolean
  canGoForward: boolean
}

const NavContext = createContext<NavContextValue | null>(null)

const MAX_HISTORY = 50

export function NavProvider({ children }: { children: ReactNode }): React.JSX.Element {
  // SPEC §4.1: the app always opens on Today. A cursor into the stack
  // (browser-style) keeps the forward entries alive after back().
  const [hist, setHist] = useState<{ stack: View[]; idx: number }>({
    stack: [{ name: 'today' }],
    idx: 0
  })
  // "Open full page" floats a screen over the current one instead of
  // replacing it — closing lands exactly where you were.
  const [overlay, setOverlay] = useState<View | null>(null)

  const navigate = useCallback((v: View) => {
    // A link followed inside the overlay takes over the main screen.
    setOverlay(null)
    setHist(({ stack, idx }) => {
      // Re-clicking the current screen shouldn't grow the history.
      if (JSON.stringify(stack[idx]) === JSON.stringify(v)) return { stack, idx }
      // Navigating somewhere new discards the forward entries.
      const next = [...stack.slice(0, idx + 1), v].slice(-MAX_HISTORY)
      return { stack: next, idx: next.length - 1 }
    })
  }, [])

  const openOverlay = useCallback((v: View) => setOverlay(v), [])
  const closeOverlay = useCallback(() => setOverlay(null), [])

  const back = useCallback(() => {
    setHist((h) => (h.idx > 0 ? { ...h, idx: h.idx - 1 } : h))
  }, [])
  const forward = useCallback(() => {
    setHist((h) => (h.idx < h.stack.length - 1 ? { ...h, idx: h.idx + 1 } : h))
  }, [])

  const view = hist.stack[hist.idx]
  return (
    <NavContext.Provider
      value={{
        view,
        overlay,
        navigate,
        openOverlay,
        closeOverlay,
        back,
        forward,
        canGoBack: hist.idx > 0,
        canGoForward: hist.idx < hist.stack.length - 1
      }}
    >
      {children}
    </NavContext.Provider>
  )
}

export function useNav(): NavContextValue {
  const ctx = useContext(NavContext)
  if (!ctx) throw new Error('useNav outside NavProvider')
  return ctx
}
