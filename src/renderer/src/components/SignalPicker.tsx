/**
 * The five signal slots as one row: pick where this task ranks among
 * "what happens next" (1 is loudest). Picking the slot it already
 * holds clears it; claiming an occupied slot bumps its holder down
 * one (and so on down the line — a full house drops old 5 back to a
 * regular task). Slots are per day, keyed by the task's scheduled day.
 */
export function SignalPicker({
  value,
  onPick
}: {
  value: number | null
  onPick: (priority: number | null) => void
}): React.JSX.Element {
  return (
    <div className="row signal-picker">
      <span className="signal-picker-label">⚡ signal</span>
      {[1, 2, 3, 4, 5].map((p) => (
        <button
          key={p}
          className={`btn small ${value === p ? 'primary' : 'ghost'}`}
          title={
            value === p
              ? 'Clear this signal'
              : `Signal priority ${p}${p === 1 ? ' — loudest' : ''}; whoever holds it bumps down one`
          }
          onClick={() => onPick(value === p ? null : p)}
        >
          {p}
        </button>
      ))}
    </div>
  )
}
