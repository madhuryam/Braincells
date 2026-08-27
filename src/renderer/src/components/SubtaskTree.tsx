import { useState } from 'react'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { todayYmd } from '@shared/dates'
import type { Item } from '@shared/types'
import { useMutate } from '../state/data'
import { shortTitle, useUndo } from '../state/undo'
import { usePendingOrder } from './dnd'
import { CheckableInput, Checkbox } from './bits'

export type SubtaskTreeRows = Array<{ parentId: string; depth: number; item: Item }>

/**
 * Which of a task's subtasks actually show on its card: everything
 * still open, plus — only on a parent that is itself done — the pieces
 * finished on the viewed day (the card is then the day's record).
 * Finished subtasks of an open parent live in the day's Done section
 * instead. Exported so the card's count can use the SAME rule as the
 * tree and never advertise rows that aren't there.
 */
export function visibleSubtasks(
  parent: Item,
  tree: SubtaskTreeRows,
  contextDate?: string
): SubtaskTreeRows {
  const dayContext = contextDate ?? todayYmd()
  return tree.filter(({ item: s }) =>
    s.status !== 'done'
      ? true
      : parent.status === 'done' && (s.completedAt ?? '').slice(0, 10) === dayContext
  )
}

/** Create a task and file it as a subtask under `parentId`. Callers
 *  wrap in mutate() so the UI refreshes once the pair lands. */
export async function createSubtask(
  parentId: string,
  projectId: string | null,
  title: string
): Promise<void> {
  const sub = await window.api.createItem({ kind: 'task', title, status: 'active', projectId })
  await window.api.linkItems(sub.id, parentId, 'subtask-of')
}

/**
 * One row of the subtask tree: indented by depth, checkable in place,
 * with hover actions to add a nested subtask (＋) or drop it (✕).
 * The row is draggable like a task card — among its siblings to
 * reorder, or out onto the timeline to give it a time block.
 */
function SubtaskRow({
  sub,
  depth,
  sortableIds,
  dimmed,
  plainDone,
  onToggle,
  onDrop,
  onRename,
  onAddChild
}: {
  sub: Item
  depth: number
  /** Ids of the visible siblings at this row's level, in list order. */
  sortableIds: string[]
  /** This subtask has its own block on the calendar: the same
   *  whisper-gray the parent's header wears — per row, never inherited. */
  dimmed?: boolean
  /** Record views: a done row stays readable — no strikethrough. */
  plainDone?: boolean
  onToggle: (sub: Item) => void
  onDrop: (sub: Item) => void
  onRename: (sub: Item, title: string) => void
  onAddChild: (parentId: string, title: string) => Promise<void>
}): React.JSX.Element {
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const indent = (depth - 1) * 22
  // `subtask: true` keeps other cards from adopting this row's "home"
  // (no date, parent's project) when they're dropped onto it.
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: sub.id,
    data: { item: sub, sortableIds, subtask: true }
  })
  return (
    <>
      <div
        ref={setNodeRef}
        className={`subtask-row${dimmed ? ' timeblocked' : ''}`}
        {...attributes}
        {...listeners}
        // The row sits inside a draggable card — stop the pointer-down
        // here so grabbing a subtask never also lifts the whole parent.
        onPointerDown={(e) => {
          e.stopPropagation()
          listeners?.onPointerDown?.(e)
        }}
        style={{
          marginLeft: indent,
          transform: CSS.Transform.toString(transform),
          transition,
          opacity: isDragging ? 0.35 : undefined
        }}
      >
        <Checkbox checked={sub.status === 'done'} onToggle={() => onToggle(sub)} />
        {editing ? (
          <input
            autoFocus
            style={{ flex: 1, minWidth: 0, fontSize: 14.5, padding: '3px 8px' }}
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={() => {
              setEditing(false)
              const t = titleDraft.trim()
              if (t && t !== sub.title) onRename(sub, t)
            }}
            onKeyDown={(e) => {
              // Enter / ⌘⏎ / ⌃⏎ / ⇧⏎ all commit-and-exit; blur saves.
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
              if (e.key === 'Escape') {
                e.stopPropagation() // don't also collapse the card
                setTitleDraft(sub.title)
                setEditing(false)
              }
            }}
          />
        ) : (
          <button
            className={`subtask-title ${sub.status === 'done' && !plainDone ? 'done' : ''}`}
            style={{ textAlign: 'left', cursor: 'text' }}
            title="Click to edit"
            onClick={() => {
              setTitleDraft(sub.title)
              setEditing(true)
            }}
          >
            {sub.title}
          </button>
        )}
        <button
          className="btn ghost small"
          title="Add a subtask under this one"
          onClick={() => setAdding(!adding)}
        >
          ＋
        </button>
        <button className="btn ghost small" title="Drop this subtask" onClick={() => onDrop(sub)}>
          ✕
        </button>
      </div>
      {adding && (
        <div style={{ marginLeft: indent + 22 }}>
          <CheckableInput
            autoFocus
            placeholder={`Add a subtask under “${shortTitle(sub.title)}”…`}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={async (e) => {
              if (e.key === 'Escape') {
                setAdding(false)
                setDraft('')
              }
              if (e.key === 'Enter' && draft.trim()) {
                await onAddChild(sub.id, draft.trim())
                setDraft('')
              }
            }}
          />
        </div>
      )}
    </>
  )
}

/**
 * A task's whole subtask tree — checkable, renameable, draggable,
 * nestable, droppable — ONE component shared by every surface that
 * shows subtasks (the card editor, the task peek), so they never
 * drift apart. The caller owns the tree query (it usually needs the
 * counts anyway) and passes the rows in.
 */
export function SubtaskTree({
  parent,
  tree,
  contextDate,
  plainDone = false
}: {
  parent: Item
  tree: SubtaskTreeRows
  /**
   * The day of the list this tree sits in. Finished subtasks show only
   * when completed on this day (default today) — a task moved to
   * another day presents just its remaining work. Completions made
   * while viewing a past day are logged on THAT day.
   */
  contextDate?: string
  plainDone?: boolean
}): React.JSX.Element | null {
  const mutate = useMutate()
  const { pushUndo } = useUndo()

  // While a subtask drag-reorder is persisting, the tree still carries
  // the old DB order (same trap TaskGroups dodges) — re-rank the moved
  // siblings and re-flatten depth-first so the drop doesn't snap back.
  const pendingOrder = usePendingOrder()
  let orderedTree = tree
  if (pendingOrder && tree.some((r) => pendingOrder.includes(r.item.id))) {
    const rank = new Map(pendingOrder.map((id, i) => [id, i]))
    const kids = new Map<string, SubtaskTreeRows>()
    for (const row of tree) {
      const list = kids.get(row.parentId) ?? []
      list.push(row)
      kids.set(row.parentId, list)
    }
    for (const list of kids.values()) {
      const moved = list
        .filter((r) => rank.has(r.item.id))
        .sort((a, b) => rank.get(a.item.id)! - rank.get(b.item.id)!)
      let n = 0
      list.forEach((r, i) => {
        if (rank.has(r.item.id)) list[i] = moved[n++]
      })
    }
    orderedTree = []
    const walk = (pid: string): void => {
      for (const row of kids.get(pid) ?? []) {
        orderedTree.push(row)
        walk(row.item.id)
      }
    }
    walk(parent.id)
  }

  // A finished subtask leaves the tree — it reappears in the day's
  // Done section, grouped under this parent's name. Only a parent that
  // is itself done keeps that day's finished pieces: it IS the record.
  const visibleTree = visibleSubtasks(parent, orderedTree, contextDate)
  // Visible siblings per parent: a drag-reorder stays within one
  // nesting level (dropping on a row of another level is a no-op).
  const siblingIds = new Map<string, string[]>()
  for (const row of visibleTree) {
    const list = siblingIds.get(row.parentId) ?? []
    list.push(row.item.id)
    siblingIds.set(row.parentId, list)
  }

  const addChild = async (parentId: string, title: string): Promise<void> => {
    await mutate(() => createSubtask(parentId, parent.projectId, title))
  }
  const toggleSubtask = (sub: Item): void => {
    const wasDone = sub.status === 'done'
    // Past-day views backdate, same as the card's own checkbox.
    const backdate = !wasDone && contextDate && contextDate < todayYmd()
    void mutate(() =>
      window.api.updateItem(sub.id, {
        status: wasDone ? 'active' : 'done',
        ...(backdate ? { completedAt: contextDate } : {})
      })
    )
    if (!wasDone) {
      pushUndo(`Completed “${shortTitle(sub.title)}”`, async () => {
        await window.api.updateItem(sub.id, { status: 'active' })
      })
    }
  }
  const dropSubtask = (sub: Item): void => {
    void mutate(() => window.api.updateItem(sub.id, { status: 'dropped' }))
    pushUndo(`Dropped “${shortTitle(sub.title)}”`, async () => {
      await window.api.updateItem(sub.id, { status: 'active' })
    })
  }

  if (visibleTree.length === 0) return null

  return (
    <SortableContext
      items={visibleTree.map((t) => t.item.id)}
      strategy={verticalListSortingStrategy}
    >
      <div className="subtasks" style={{ marginTop: 8 }}>
        {visibleTree.map(({ item: sub, depth, parentId }) => (
          <SubtaskRow
            key={sub.id}
            sub={sub}
            depth={depth}
            sortableIds={siblingIds.get(parentId) ?? []}
            dimmed={!!(contextDate && sub.scheduledTime) && !plainDone}
            plainDone={plainDone}
            onToggle={toggleSubtask}
            onDrop={dropSubtask}
            onRename={(s, title) => mutate(() => window.api.updateItem(s.id, { title }))}
            onAddChild={addChild}
          />
        ))}
      </div>
    </SortableContext>
  )
}
