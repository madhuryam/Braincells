import { useState } from 'react'
import { useData, useLiveQuery, useMutate } from '../state/data'
import { useNav } from '../state/nav'
import { Checkbox, ProjectDot } from './bits'
import { durationLabel, KIND_ICON, prettyDate, projectLabel } from '../format'
import { LinkChips } from './LinkChips'
import { extractLinksFromHtml } from '../links'
import { ItemNotes } from './ItemNotes'

/**
 * Single-item view for the detail panel: a single header row (title,
 * star, open-canvas, close), meta pills, and editable notes. Canvas
 * titles edit in place. Note the full page and this peek are two
 * editing surfaces for the same item; last save wins, acceptable
 * because the peek and full view are rarely edited together.
 */
export function ItemDetail({
  itemId,
  onClose
}: {
  itemId: string
  /** Renders a ✕ in the header row — pass it here instead of to DetailPanel. */
  onClose?: () => void
}): React.JSX.Element | null {
  const item = useLiveQuery(() => window.api.getItem(itemId), [itemId])
  const { projects } = useData()
  const { openOverlay } = useNav()
  const mutate = useMutate()
  // Total time on the calendar — every block for this task summed
  // (the task's own slot plus any extra blocks).
  const calendarMinutes = useLiveQuery(() => window.api.calendarMinutes(itemId), [itemId]) ?? 0

  // Canvas title: local draft only while focused; idle, the input
  // mirrors item.title so renames made on the full canvas land here.
  const [titleDraft, setTitleDraft] = useState<string | null>(null)

  if (!item) return null

  const project = projects.find((p) => p.id === item.projectId)
  const checkable = item.kind === 'task' || item.kind === 'prep'
  const done = item.status === 'done'
  const isPage = item.kind === 'page'

  return (
    // Canvas peeks stretch to the panel's full height (peek-canvas) —
    // the body IS the content, so the whole panel is writing surface.
    <div className={isPage ? 'stack peek-canvas' : 'stack'}>
      <div className="row">
        {checkable ? (
          <Checkbox
            checked={done}
            onToggle={() =>
              mutate(() => window.api.updateItem(item.id, { status: done ? 'active' : 'done' }))
            }
          />
        ) : (
          !isPage && <span aria-hidden>{KIND_ICON[item.kind]}</span>
        )}
        {/* Every kind's title edits in place (it started pages-only). */}
        <input
          className="peek-title"
          style={{ textDecoration: done ? 'line-through' : undefined }}
          value={titleDraft ?? item.title}
          placeholder={isPage ? 'Untitled canvas' : 'Untitled'}
          onFocus={() => setTitleDraft(item.title)}
          onChange={(e) => setTitleDraft(e.target.value)}
          onBlur={() => {
            const t = titleDraft
            setTitleDraft(null)
            if (t !== null && t !== item.title)
              mutate(() => window.api.updateItem(item.id, { title: t }))
          }}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
        <button
          className="btn ghost icon-btn"
          title={item.starred ? 'Unstar' : 'Star — pin it to the sidebar'}
          onClick={() => mutate(() => window.api.updateItem(item.id, { starred: !item.starred }))}
        >
          {item.starred ? '⭐' : '☆'}
        </button>
        {isPage && (
          <button
            className="btn ghost icon-btn"
            title="Open canvas"
            onClick={() => openOverlay({ name: 'page', itemId: item.id })}
          >
            ↗
          </button>
        )}
        {onClose && (
          <button className="btn ghost icon-btn" title="Close panel" onClick={onClose}>
            ✕
          </button>
        )}
      </div>
      <div className="card-meta">
        {project && (
          <span className="pill" title={project.name}>
            <ProjectDot color={project.color} /> {projectLabel(project)}
          </span>
        )}
        {item.scheduledDate && <span className="pill">📅 {prettyDate(item.scheduledDate)}</span>}
        {calendarMinutes > 0 && (
          <span className="pill" title="Total time blocked on the calendar, all blocks summed">
            ⏱ {durationLabel(calendarMinutes)} on calendar
          </span>
        )}
        {item.dueDate && <span className="pill">⏰ due {prettyDate(item.dueDate)}</span>}
        {item.completedAt && <span className="pill">✓ {prettyDate(item.completedAt.slice(0, 10))}</span>}
      </div>
      {/* Attached URLs, same chips as the card editor; hyperlinks in
          the notes ride along read-only. */}
      <LinkChips
        links={item.links}
        derived={extractLinksFromHtml(item.richContent ?? '')}
        onSave={(next) => mutate(() => window.api.updateItem(item.id, { links: next }))}
      />
      <ItemNotes item={item} />
    </div>
  )
}
