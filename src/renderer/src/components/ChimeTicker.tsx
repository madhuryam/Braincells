import { useEffect } from 'react'
import { useLiveQuery } from '../state/data'
import {
  DEFAULT_CHIME,
  inChimeWindow,
  msUntilNextChime,
  playChime,
  type ChimeSetting
} from '../chime'

/**
 * Mounts once at the app root and rings the interval chime. Each fire
 * reschedules from a fresh clock reading, so the timer self-corrects
 * drift (and a late fire after system sleep realigns on the next one).
 * The timer keeps ticking outside the awake window — it just doesn't
 * make a sound — so no re-arm is needed when the window opens.
 */
export function ChimeTicker(): null {
  const chime =
    useLiveQuery(() => window.api.getSetting<ChimeSetting>('chime'), []) ?? DEFAULT_CHIME
  const { enabled, intervalMinutes, sound } = chime
  const windowStart = chime.windowStart ?? 0
  const windowEnd = chime.windowEnd ?? 24

  useEffect(() => {
    if (!enabled) return
    let timer: number
    const schedule = (): void => {
      timer = window.setTimeout(() => {
        if (inChimeWindow(new Date(), windowStart, windowEnd)) playChime(sound)
        schedule()
      }, msUntilNextChime(new Date(), intervalMinutes))
    }
    schedule()
    return () => window.clearTimeout(timer)
  }, [enabled, intervalMinutes, sound, windowStart, windowEnd])

  return null
}
