import { useState } from 'react'
import { motion } from 'framer-motion'
import { useLiveQuery, useMutate } from '../state/data'

/**
 * The morning-after prompt for signals. When an unfinished signal
 * carries over into a day whose slots are already spoken for, nothing
 * gets auto-shuffled — this modal lists everything marked as a signal
 * for today and the user picks, in order, which (up to five) keep
 * their slots. Clicking ranks 1, 2, 3…; clicking again unranks.
 * Whatever isn't picked goes back to being a regular task.
 *
 * Rides the hotkeys modal shell (scrim + card), like the prep picker.
 */
export function SignalReconcile({ onClose }: { onClose: () => void }): React.JSX.Element | null {
  const pool = useLiveQuery(() => window.api.signalPool(), [])
  const mutate = useMutate()
  // Picked ids in rank order — index 0 becomes signal 1, and so on.
  const [picked, setPicked] = useState<string[]>([])

  if (!pool || pool.length === 0) return null

  const toggle = (id: string): void => {
    setPicked((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : prev.length < 5 ? [...prev, id] : prev
    )
  }
  const save = (): void => {
    void mutate(() => window.api.resolveSignals(picked))
    onClose()
  }

  return (
    <motion.div
      className="hotkeys-scrim"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.12, ease: 'easeOut' }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <motion.div
        className="hotkeys-modal"
        style={{ width: 'min(460px, 92vw)' }}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.15, ease: [0.25, 0.1, 0.25, 1] }}
      >
        <div className="row" style={{ marginBottom: 4 }}>
          <h2 style={{ margin: 0 }}>⚡ Too many signals</h2>
          <button
            className="btn ghost icon-btn"
            style={{ marginLeft: 'auto' }}
            title="Decide later (the prompt returns until it's settled)"
            onClick={onClose}
          >
            ✕
          </button>
        </div>
        <p style={{ margin: '0 0 12px', fontSize: 13.5, color: 'var(--text-soft)' }}>
          Yesterday&rsquo;s unfinished signals carried into today and collided with the ones
          already set. Click what happens next, in order — everything unpicked becomes a
          regular task.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {pool.map((item) => {
            const rank = picked.indexOf(item.id)
            return (
              <button
                key={item.id}
                className={`btn ${rank >= 0 ? 'primary' : 'ghost'}`}
                style={{ justifyContent: 'flex-start', gap: 8 }}
                onClick={() => toggle(item.id)}
              >
                <span
                  style={{
                    width: 22,
                    flexShrink: 0,
                    fontWeight: 700,
                    textAlign: 'center',
                    opacity: rank >= 0 ? 1 : 0.35
                  }}
                >
                  {rank >= 0 ? `${rank + 1}` : '·'}
                </span>
                <span
                  style={{
                    flex: 1,
                    minWidth: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    textAlign: 'left'
                  }}
                >
                  {item.title || 'Untitled'}
                </span>
                <span style={{ fontSize: 12, color: 'var(--text-faint)', flexShrink: 0 }}>
                  was ⚡{item.signalPriority}
                </span>
              </button>
            )
          })}
        </div>
        <div className="row" style={{ marginTop: 14 }}>
          <span style={{ fontSize: 12.5, color: 'var(--text-faint)' }}>
            {picked.length === 0 ? 'none picked — all demote' : `${picked.length} of 5 picked`}
          </span>
          <button className="btn primary" style={{ marginLeft: 'auto' }} onClick={save}>
            Set today&rsquo;s signals
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}
