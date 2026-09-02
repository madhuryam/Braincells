import type { ReactNode } from 'react'

/**
 * The "Notes" section chrome every notes surface shares: the label on
 * top, the meeting-notes dress (bordered, typeable-looking editor
 * area) below. The meeting screen and the task peek both render their
 * own editor inside — this owns only what makes them look like the
 * same section.
 */
export function NotesSection({
  fill = false,
  children
}: {
  /** Stretch to the bottom of the panel this section sits in — for
   *  peeks where notes are the last block and should own the rest of
   *  the height instead of stopping at a cut-off strip. */
  fill?: boolean
  children: ReactNode
}): React.JSX.Element {
  return (
    <section className={`meeting-notes${fill ? ' notes-fill' : ''}`}>
      <div className="section-label">Notes</div>
      {children}
    </section>
  )
}
