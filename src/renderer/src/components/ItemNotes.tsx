import { useEffect, useRef, useState } from 'react'
import type { Item } from '@shared/types'
import { useData, useMutate } from '../state/data'
import { RichEditor } from './RichEditor'
import { itemBodyHtml } from '../richtext'

/**
 * An item's notes as an autosaving editor — the one block shared by
 * every surface that edits notes in place (the detail peek, the task
 * peek). Saves land 600ms after the last keystroke and flush on
 * unmount. Multiple surfaces may edit the same item; last save wins,
 * acceptable because two are rarely edited together.
 */
export function ItemNotes({
  item,
  variant = 'compact',
  toolbar = false
}: {
  item: Item
  /** Editor dress: 'compact' for notes inside cards (the default),
   *  'full' where the notes are a real section (the task peek, which
   *  mirrors a meeting's notes pane). */
  variant?: 'full' | 'compact'
  toolbar?: boolean
}): React.JSX.Element {
  const { bump } = useData()
  const mutate = useMutate()
  const itemId = item.id

  // Reseed on outside edits: the editor seeds once per mount, so when
  // the stored body comes back different from what this editor last
  // saw — e.g. the full canvas was opened over this peek, edited, and
  // closed — remount it via an epoch in the key. Our own saves
  // round-trip byte-identical and never trigger it.
  const lastHtml = useRef<string | null>(null)
  const [epoch, setEpoch] = useState(0)

  // Notes autosave: the rich editor owns the text while typing; saves
  // land 600ms after the last keystroke, and flush on close/unmount.
  const pendingBody = useRef<{ html: string; text: string } | null>(null)
  const bodyTimer = useRef<number | undefined>(undefined)
  const flushBody = (): void => {
    window.clearTimeout(bodyTimer.current)
    const p = pendingBody.current
    pendingBody.current = null
    if (p) mutate(() => window.api.updateItem(itemId, { richContent: p.html, content: p.text }))
  }
  const onBodyChange = (html: string, text: string): void => {
    lastHtml.current = html
    pendingBody.current = { html, text }
    window.clearTimeout(bodyTimer.current)
    bodyTimer.current = window.setTimeout(flushBody, 600)
  }
  useEffect(
    () => () => {
      // Unmount flush goes straight to the API, then bumps so the
      // surfaces still on screen (list cards) show the edit.
      const p = pendingBody.current
      pendingBody.current = null
      window.clearTimeout(bodyTimer.current)
      if (p)
        window.api.updateItem(itemId, { richContent: p.html, content: p.text }).then(bump)
    },
    [itemId, bump]
  )

  const bodyHtml = itemBodyHtml(item)
  useEffect(() => {
    if (lastHtml.current === null) {
      lastHtml.current = bodyHtml // first load — the editor seeds with this
    } else if (bodyHtml !== lastHtml.current && !pendingBody.current) {
      lastHtml.current = bodyHtml
      setEpoch((e) => e + 1)
    }
  }, [bodyHtml])

  return (
    // Markdown shortcuts (`# `, `**`, `- `) format as you type either
    // way, and the placeholder replaces the old "no notes" dead-end.
    <RichEditor
      key={`${itemId}:${epoch}`}
      variant={variant}
      toolbar={toolbar}
      initialHtml={bodyHtml}
      placeholder="Notes — type **bold**, # headings, - lists…"
      onChange={onBodyChange}
    />
  )
}
