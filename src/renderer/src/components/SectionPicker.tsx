import { useLiveQuery } from '../state/data'

/**
 * Mutually-exclusive section chips for one project — the companion to
 * ProjectPicker, shown once a project is chosen so a task can be filed
 * into a subsection instead of always landing in General. Renders
 * nothing when there's no project or the project has no sections, so
 * surfaces can include it unconditionally.
 */
export function SectionPicker({
  projectId,
  value,
  onChange
}: {
  projectId: string | null
  value: string | null
  onChange: (sectionId: string | null) => void
}): React.JSX.Element | null {
  const sections =
    useLiveQuery(
      () => (projectId ? window.api.listSections(projectId) : Promise.resolve([])),
      [projectId]
    ) ?? []
  const active = sections.filter((s) => s.status === 'active')
  if (!projectId || active.length === 0) return null

  return (
    <div className="project-picker" style={{ alignItems: 'center' }}>
      <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-faint)' }}>section</span>
      <button
        className={`project-chip ${value === null ? 'selected' : ''}`}
        title="No section — files under General"
        onClick={() => onChange(null)}
      >
        General
      </button>
      {active.map((s) => (
        <button
          key={s.id}
          className={`project-chip ${value === s.id ? 'selected' : ''}`}
          title={s.name}
          onClick={() => onChange(s.id)}
        >
          {s.name}
        </button>
      ))}
    </div>
  )
}
