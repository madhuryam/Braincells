/**
 * The five signal slots as one row: pick where this task ranks among
 * "what happens next" (1 is loudest). Picking the slot it already
 * holds clears it; a slot held by another task is quietly taken over
 * — that hand-off is also what keeps signals capped at five.
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
              : `Signal priority ${p}${p === 1 ? ' — loudest' : ''}; takes the slot from whoever holds it`
          }
          onClick={() => onPick(value === p ? null : p)}
        >
          {p}
        </button>
      ))}
    </div>
  )
}
