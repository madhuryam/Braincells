/**
 * The interval chime: a teeny synthesized ding on the clock (:00, :15,
 * :30, :45 at the default 15 minutes) as a nudge to log what you've
 * been working on. Sounds are generated with WebAudio — no asset files,
 * and the gain stays tiny by design.
 */

export type ChimeSoundId = 'ding' | 'blip' | 'bell'

export interface ChimeSetting {
  enabled: boolean
  intervalMinutes: number
  sound: ChimeSoundId
  /** The hours the chime is awake: rings from windowStart:00 through
   *  windowEnd:00 inclusive, silent outside. 0–24 = all day. Optional
   *  because settings saved before the window existed lack them. */
  windowStart?: number
  windowEnd?: number
}

export const DEFAULT_CHIME: ChimeSetting = {
  enabled: true,
  intervalMinutes: 15,
  sound: 'ding',
  windowStart: 0,
  windowEnd: 24
}

export const CHIME_SOUNDS: Array<{ id: ChimeSoundId; label: string }> = [
  { id: 'ding', label: 'Soft ding' },
  { id: 'blip', label: 'Wood blip' },
  { id: 'bell', label: 'Two-tone bell' }
]

// The intervals offered all divide the hour, so chimes land on
// clock-recognizable minutes rather than "N minutes since launch".
export const CHIME_INTERVALS = [5, 10, 15, 20, 30, 60]

/**
 * How long until the next clock-aligned chime. Fires at multiples of
 * the interval past the top of the hour; exactly on a boundary means
 * the boundary just chimed, so the answer is a full period.
 */
export function msUntilNextChime(now: Date, intervalMinutes: number): number {
  const period = Math.max(1, Math.round(intervalMinutes)) * 60_000
  const msIntoHour = (now.getMinutes() * 60 + now.getSeconds()) * 1000 + now.getMilliseconds()
  return period - (msIntoHour % period)
}

/**
 * Whether the chime window is open right now. Inclusive on both ends,
 * so a 7am–5pm window rings the 7:00 and the 17:00 chime — the
 * bookends of the working day — and nothing after.
 */
export function inChimeWindow(now: Date, startHour: number, endHour: number): boolean {
  const mins = now.getHours() * 60 + now.getMinutes()
  return mins >= startHour * 60 && mins <= endHour * 60
}

/** Human copy for when the chime rings, matching the picked interval. */
export function chimeScheduleLabel(intervalMinutes: number): string {
  if (intervalMinutes >= 60) return 'at the top of each hour'
  const ticks = Array.from(
    { length: Math.floor(60 / intervalMinutes) },
    (_, i) => `:${String(i * intervalMinutes).padStart(2, '0')}`
  )
  if (ticks.length > 6) return `every ${intervalMinutes} minutes on the clock`
  return `at ${ticks.slice(0, -1).join(', ')} and ${ticks[ticks.length - 1]}`
}

// One shared context, created on first play (AudioContext before any
// user gesture can start suspended — resume handles that).
let audioCtx: AudioContext | null = null

function tone(
  ctx: AudioContext,
  freq: number,
  at: number,
  dur: number,
  peak: number,
  type: OscillatorType = 'sine'
): void {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = type
  osc.frequency.value = freq
  gain.gain.setValueAtTime(peak, at)
  gain.gain.exponentialRampToValueAtTime(0.0001, at + dur)
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start(at)
  osc.stop(at + dur)
}

export function playChime(sound: ChimeSoundId): void {
  audioCtx ??= new AudioContext()
  if (audioCtx.state === 'suspended') void audioCtx.resume()
  const t = audioCtx.currentTime
  switch (sound) {
    case 'ding':
      tone(audioCtx, 880, t, 0.7, 0.06)
      break
    case 'blip':
      // A woodblock-ish tick: high, brief, triangle for a bit of knock.
      tone(audioCtx, 1320, t, 0.09, 0.09, 'triangle')
      break
    case 'bell':
      tone(audioCtx, 660, t, 0.5, 0.05)
      tone(audioCtx, 880, t + 0.18, 0.6, 0.05)
      break
  }
}
