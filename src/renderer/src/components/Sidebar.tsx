import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useDndContext } from '@dnd-kit/core'
import { todayYmd } from '@shared/dates'
import { useData, useLiveQuery, useMutate } from '../state/data'
import { useNav, type View } from '../state/nav'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { projectLabel } from '../format'
import { ProjectDot } from './bits'
import { ContextMenu } from './ContextMenu'
import { DropZone, SortableProjectRow } from './dnd'
import { HotkeysHelp, isTyping } from './HotkeysHelp'

export const DEFAULT_TIME_ZONE = 'America/New_York'

/** A live clock with date in the configured time zone, always AM/PM. */
function Clock(): React.JSX.Element {
  const timeZone =
    useLiveQuery(() => window.api.getSetting<string>('timeZone'), []) ?? DEFAULT_TIME_ZONE
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  // An invalid/unknown zone would throw; fall back to the system zone.
  const fmt = (opts: Intl.DateTimeFormatOptions): string => {
    try {
      return now.toLocaleString(undefined, { timeZone, ...opts })
    } catch {
      return now.toLocaleString(undefined, opts)
    }
  }
  const abbr = fmt({ timeZoneName: 'short' }).split(' ').pop()

  return (
    <div className="sidebar-clock" title={timeZone}>
      <span className="sidebar-time">
        {fmt({ hour: 'numeric', minute: '2-digit', hour12: true })}
      </span>
      <span className="sidebar-date">
        {fmt({ weekday: 'short', month: 'short', day: 'numeric' })} · {abbr}
      </span>
    </div>
  )
}

function NavItem({
  view,
  icon,
  label,
  badge,
  isActive
}: {
  view: View
  icon: ReactNode
  label: string
  badge?: number
  isActive: boolean
}): React.JSX.Element {
  const { navigate } = useNav()
  return (
    <button
      className={`nav-item ${isActive ? 'active' : ''}`}
      title={label}
      onClick={() => navigate(view)}
    >
      <span className="nav-icon" aria-hidden>
        {icon}
      </span>
      <span>{label}</span>
      {badge !== undefined && badge > 0 && <span className="badge">{badge}</span>}
    </button>
  )
}

/**
 * Right-click on a project: its canvases, right here — click one and
 * it floats over whatever you're looking at (the same pop-open view
 * the ↗ buttons use), no trip through the project page.
 */
function ProjectCanvasMenu({
  projectId,
  x,
  y,
  onClose
}: {
  projectId: string
  x: number
  y: number
  onClose: () => void
}): React.JSX.Element {
  const { openOverlay } = useNav()
  const mutate = useMutate()
  const items = useLiveQuery(() => window.api.projectItems(projectId), [projectId]) ?? []
  const pages = items
    .filter((i) => i.kind === 'page' && (i.status === 'active' || i.status === 'inbox'))
    .sort((a, b) => (b.updatedAt ?? b.createdAt).localeCompare(a.updatedAt ?? a.createdAt))

  const newCanvas = async (): Promise<void> => {
    onClose()
    let created: { id: string } | undefined
    await mutate(async () => {
      created = await window.api.createItem({ kind: 'page', title: '', status: 'active', projectId })
    })
    if (created) openOverlay({ name: 'page', itemId: created.id })
  }

  return (
    <ContextMenu x={x} y={y} onClose={onClose}>
      <div style={{ maxHeight: 280, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        {pages.map((p) => (
          <button
            key={p.id}
            className="btn ghost small"
            style={{ justifyContent: 'flex-start', flexShrink: 0 }}
            onClick={() => {
              onClose()
              openOverlay({ name: 'page', itemId: p.id })
            }}
          >
            📄 {p.title || 'Untitled canvas'}
          </button>
        ))}
      </div>
      {pages.length === 0 && (
        <span style={{ padding: '4px 8px', fontSize: 13.5, color: 'var(--text-faint)' }}>
          no canvases yet
        </span>
      )}
      <button
        className="btn ghost small"
        style={{ justifyContent: 'flex-start', borderTop: '1px solid var(--border)', borderRadius: 0 }}
        onClick={() => void newCanvas()}
      >
        ＋ new canvas
      </button>
    </ContextMenu>
  )
}

export function Sidebar(): React.JSX.Element {
  // `dark` comes from context state (not the DOM attribute) so the
  // toggle button always re-renders in step with the actual theme.
  const { projects, dark, toggleDark } = useData()
  const { view, navigate } = useNav()
  // Auto-collapse: the sidebar rests as a 64px rail and expands while
  // the pointer is over it — unless pinned open (📌, remembered).
  // null = the setting hasn't loaded; treat as expanded to avoid a
  // collapse-then-expand flash on launch.
  const [pinned, setPinned] = useState<boolean | null>(null)
  const [hovered, setHovered] = useState(false)
  // Collapse on a short delay, not instantly: a momentary event gap
  // (crossing a scrollbar, a portal, a re-render) must not flap the
  // sidebar shut mid-reach.
  const leaveTimer = useRef<number | undefined>(undefined)
  const onEnter = (): void => {
    window.clearTimeout(leaveTimer.current)
    setHovered(true)
  }
  const onLeave = (): void => {
    window.clearTimeout(leaveTimer.current)
    leaveTimer.current = window.setTimeout(() => setHovered(false), 250)
  }
  const [keysOpen, setKeysOpen] = useState(false)
  // Right-click on a project: its canvases in a context menu. While
  // it's up, the sidebar holds itself open even if the pointer leaves.
  const [canvasMenu, setCanvasMenu] = useState<{ projectId: string; x: number; y: number } | null>(
    null
  )

  useEffect(() => {
    window.api.getSetting<boolean>('sidebarPinned').then((v) => setPinned(v === true))
  }, [])
  const setPin = (v: boolean): void => {
    setPinned(v)
    void window.api.setSetting('sidebarPinned', v)
  }

  // Mid-drag, pointer capture swallows hover — hold the sidebar open
  // for the whole drag so cards can still be filed onto projects.
  const { active: dragActive } = useDndContext()

  const expanded = pinned !== false || hovered || canvasMenu !== null || dragActive !== null
  const collapsed = !expanded

  // "?" opens the shortcut cheat-sheet from anywhere (unless typing).
  // Lives here because the sidebar is mounted on every screen.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === '?' && !e.metaKey && !e.ctrlKey && !isTyping(e)) {
        e.preventDefault()
        setKeysOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const projectContextMenu = (projectId: string) => (e: React.MouseEvent) => {
    e.preventDefault()
    setCanvasMenu({ projectId, x: e.clientX, y: e.clientY })
  }

  return (
    // The slot holds the sidebar's place in the layout; in auto mode
    // it stays rail-width and the expanded sidebar floats OVER the
    // screen, so hovering never reflows the page.
    <div
      className={`sidebar-slot ${pinned === false ? 'auto' : 'pinned'}`}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    >
      <nav className={`sidebar ${collapsed ? 'collapsed' : ''} ${pinned === false && expanded ? 'hover-open' : ''}`}>
      <div className="sidebar-brand">{collapsed ? 'b.' : 'braincells'}</div>
      {!collapsed && <Clock />}

      {/* Dropping any card on "Today" schedules it for today. */}
      <DropZone id="nav-today" data={{ type: 'schedule', date: todayYmd() }}>
        <NavItem view={{ name: 'today' }} icon="📅" label="Today" isActive={view.name === 'today'} />
      </DropZone>
      <NavItem view={{ name: 'log' }} icon="📑" label="Weekly Log" isActive={view.name === 'log'} />
      <NavItem
        view={{ name: 'calendar' }}
        icon="🗓️"
        label="Calendar"
        isActive={view.name === 'calendar'}
      />
      <NavItem view={{ name: 'search' }} icon="🔍" label="Search" isActive={view.name === 'search'} />

      {/* Starred canvases live on their project's overview now — the
          sidebar stays pure navigation. */}
      {!collapsed && <div className="nav-section">Projects</div>}
      <NavItem
        view={{ name: 'projects' }}
        icon="📂"
        label="All projects"
        isActive={view.name === 'projects'}
      />
      {/* Drag a project to reorder; drop a card on one to file it there
          (SPEC §7 drag & drop); right-click for its canvases. */}
      {!collapsed && (
        <SortableContext items={projects.map((p) => p.id)} strategy={verticalListSortingStrategy}>
          {projects.map((p) => (
            <SortableProjectRow key={p.id} projectId={p.id} projectIds={projects.map((x) => x.id)}>
              <button
                className={`nav-item nav-item-nested ${view.name === 'project' && view.projectId === p.id ? 'active' : ''}`}
                onClick={() => navigate({ name: 'project', projectId: p.id })}
                onContextMenu={projectContextMenu(p.id)}
              >
                <ProjectDot color={p.color} />
                {/* Names too long for this rail fall back to the
                    nickname when one is set. */}
                <span className="nav-label" title={p.name}>
                  {p.name.length > 18 ? projectLabel(p) : p.name}
                </span>
              </button>
            </SortableProjectRow>
          ))}
        </SortableContext>
      )}

      {/* Collapsed rail: dot-only rows so a project is still one click
          away. Reordering (drag) lives on the expanded sidebar. */}
      {collapsed &&
        projects.map((p) => (
          <button
            key={p.id}
            className={`nav-item nav-item-dot ${view.name === 'project' && view.projectId === p.id ? 'active' : ''}`}
            title={p.name}
            onClick={() => navigate({ name: 'project', projectId: p.id })}
            onContextMenu={projectContextMenu(p.id)}
          >
            <ProjectDot color={p.color} />
          </button>
        ))}

      {/* When collapsed, only the pin remains — the footer used to
          overflow the 64px rail, leaving it unclickable. */}
      <div className="sidebar-footer">
        {!collapsed && (
          <>
            <button
              className="btn ghost icon-btn"
              title="Toggle light/dark (remembers your light theme)"
              onClick={toggleDark}
            >
              {dark ? '☀️' : '🌙'}
            </button>
            <button
              className="btn ghost icon-btn"
              title="Keyboard shortcuts (?)"
              onClick={() => setKeysOpen(true)}
            >
              ❔
            </button>
            <button
              className="btn ghost icon-btn"
              title="Settings"
              onClick={() => navigate({ name: 'settings' })}
            >
              ⚙️
            </button>
          </>
        )}
        <button
          className={`btn ghost icon-btn ${pinned ? 'pin-on' : ''}`}
          title={
            pinned
              ? 'Unpin — the sidebar auto-collapses and expands on hover'
              : 'Pin the sidebar open'
          }
          onClick={() => setPin(!(pinned ?? false))}
          style={collapsed ? undefined : { marginLeft: 'auto' }}
        >
          {pinned ? '📌' : '📍'}
        </button>
      </div>

      <HotkeysHelp open={keysOpen} onClose={() => setKeysOpen(false)} />
      {canvasMenu && (
        <ProjectCanvasMenu
          projectId={canvasMenu.projectId}
          x={canvasMenu.x}
          y={canvasMenu.y}
          onClose={() => setCanvasMenu(null)}
        />
      )}
      </nav>
    </div>
  )
}
