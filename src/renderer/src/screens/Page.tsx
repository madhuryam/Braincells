import { useEffect, useRef, useState } from 'react'
import { nowStamp } from '@shared/dates'
import { useData, useLiveQuery, useMutate } from '../state/data'
import { useNav } from '../state/nav'
import { shortTitle, useUndo } from '../state/undo'
import { ConfirmButton } from '../components/ConfirmButton'
import { RichEditor } from '../components/RichEditor'
import { BackButton } from '../components/bits'
import { ProjectPicker } from '../components/ProjectPicker'

/**
 * A Page: a full-fledged writing surface attached to a project — the
 * brain-dump-and-reference document (think Slack canvas). The editor
 * emits HTML (stored in richContent) plus a plain-text mirror (stored
 * in content) that powers full-text search and the markdown export.
 */
export function Page({ itemId }: { itemId: string }): React.JSX.Element {
  const item = useLiveQuery(() => window.api.getItem(itemId), [itemId])
  const { bump } = useData()
  const { closeOverlay } = useNav()
  const mutate = useMutate()
  const { pushUndo } = useUndo()

  // Title: seeded once per page, saved on blur (same pattern as cards).
  const [title, setTitle] = useState('')
  const seededFor = useRef<string | null>(null)
  useEffect(() => {
    if (item && seededFor.current !== item.id) {
      seededFor.current = item.id
      setTitle(item.title)
    }
  }, [item])

  // Body: debounced autosave. The editor is the source of truth while
  // typing; saves happen 600ms after the last keystroke and on leave.
  const pending = useRef<{ html: string; text: string } | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const onEditorChange = (html: string, text: string): void => {
    pending.current = { html, text }
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      const p = pending.current
      pending.current = null
      if (p) mutate(() => window.api.updateItem(itemId, { richContent: p.html, content: p.text }))
    }, 600)
  }
  useEffect(
    () => () => {
      // Flush whatever is still pending when navigating away, then
      // bump — the peek this overlay covered refetches the new body.
      window.clearTimeout(timer.current)
      const p = pending.current
      pending.current = null
      if (p) window.api.updateItem(itemId, { richContent: p.html, content: p.text }).then(bump)
    },
    [itemId, bump]
  )

  if (!item) return <div className="canvas">Canvas not found.</div>
  const archived = item.archivedAt !== null

  return (
    <div className="canvas">
      <header className="canvas-header">
        <BackButton />
        <input
          className="page-title"
          // A brand-new canvas lands with the cursor in the title —
          // type the name first, no hunting for the field.
          autoFocus={item.title === ''}
          readOnly={archived}
          value={title}
          placeholder="Untitled canvas"
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => title !== item.title && mutate(() => window.api.updateItem(itemId, { title }))}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
        {/* Archived: the one obvious way back to editable, right where
            the eye lands when typing does nothing. */}
        {archived && (
          <button
            className="btn small primary"
            title="Bring the canvas back to its project page, editable again"
            onClick={() => {
              void mutate(() => window.api.updateItem(itemId, { archivedAt: null }))
              pushUndo(`Unarchived “${shortTitle(item.title)}”`, async () => {
                await window.api.updateItem(itemId, { archivedAt: nowStamp() })
              })
            }}
          >
            Unarchive to edit
          </button>
        )}
        {/* The project pill is live: click it to refile the canvas,
            same picker the task peek uses. */}
        <ProjectPicker
          value={item.projectId}
          onChange={(projectId) => mutate(() => window.api.updateItem(itemId, { projectId }))}
        />
        <button
          className="btn ghost icon-btn"
          title={item.starred ? 'Unstar' : 'Star — pin it to the sidebar'}
          onClick={() => mutate(() => window.api.updateItem(itemId, { starred: !item.starred }))}
        >
          {item.starred ? '⭐' : '☆'}
        </button>
        {!archived && (
          <button
            className="btn ghost icon-btn"
            title="Archive — shelved (read-only) on the project page, out of the sidebar's canvas list"
            onClick={() => {
              void mutate(() => window.api.updateItem(itemId, { archivedAt: nowStamp() }))
              pushUndo(`Archived “${shortTitle(item.title)}”`, async () => {
                await window.api.updateItem(itemId, { archivedAt: null })
              })
              closeOverlay()
            }}
          >
            🗄
          </button>
        )}
        {/* Deleting lives ONLY here, on the full view — where you can
            see everything you're about to lose. Two-step, never one
            click — and soft: the canvas moves to the trash (Settings →
            Deleted canvases) for 30 days, undoable on the spot. */}
        <ConfirmButton
          label="🗑"
          confirmLabel="delete canvas?"
          title="Delete this canvas (kept 30 days in Settings → Deleted canvases)"
          className="btn ghost"
          onConfirm={async () => {
            await mutate(() => window.api.updateItem(itemId, { status: 'dropped' }))
            pushUndo(`Deleted canvas “${shortTitle(item.title)}”`, async () => {
              await window.api.updateItem(itemId, { status: 'active' })
            })
            closeOverlay()
          }}
        />
      </header>

      {/* Keyed by id: the editor seeds once per page and owns the
          content from there (no cursor-jumping re-seeds on save).
          Archived, the document renders read-only — unarchive to edit. */}
      <RichEditor
        key={item.id}
        editable={!archived}
        initialHtml={item.richContent ?? ''}
        placeholder="Brain dump here — headings, tables, checklists, whatever helps later-you."
        onChange={onEditorChange}
      />
    </div>
  )
}
