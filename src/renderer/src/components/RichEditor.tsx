import { forwardRef, useImperativeHandle, useRef } from 'react'
import { Extension } from '@tiptap/core'
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { BulletList } from '@tiptap/extension-bullet-list'
import { Heading } from '@tiptap/extension-heading'
import { Image as ImageExtension } from '@tiptap/extension-image'
import { TableKit } from '@tiptap/extension-table'
import { TextStyleKit } from '@tiptap/extension-text-style'
import { Placeholder } from '@tiptap/extensions'
import { TaskItem } from '@tiptap/extension-task-item'
import { TaskList } from '@tiptap/extension-task-list'
import type { Node as PMNode } from '@tiptap/pm/model'
import { Plugin, PluginKey, TextSelection, type Transaction } from '@tiptap/pm/state'
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view'
import { foldState } from '../headingFold'
import { tipLines, useTip } from './Tooltip'

/**
 * The rich text editor for Pages — a Slack-canvas-style writing
 * surface: headings, bold/italic/underline/strike, lists, checklists,
 * quotes, code blocks, tables, images (paste/drop/attach), and font
 * choice.
 *
 * DELIBERATELY A THIN WALL: this is the only file in the app that
 * knows TipTap exists. Everyone else passes in HTML and receives
 * (html, plainText) back. If TipTap ever falls short, swap this
 * file's internals for another editor and nothing else changes —
 * the stored format is plain HTML.
 */
export interface RichEditorProps {
  /** Seed content. Changes to this prop are ignored after mount —
   *  remount with a `key` to load a different document. */
  initialHtml: string
  placeholder?: string
  onChange: (html: string, plainText: string) => void
  /**
   * Commit-and-exit: fired on plain ⏎ (and Esc) from anywhere in the
   * notes — the caller saves and closes its editor. ⇧⏎ stays inside,
   * making a newline. When omitted, ⏎ keeps its default TipTap
   * behavior (new paragraph / next list item).
   */
  onExit?: () => void
  /**
   * 'full' (default): the whole toolbar, for Pages.
   * 'compact': a slim toolbar and short height, for notes inside
   * cards and the meeting notes pane. Markdown-style shortcuts
   * (`# `, `**bold**`, `- `, `> `…) work in both — text formats as
   * you type, Obsidian-style.
   */
  variant?: 'full' | 'compact'
  /** false hides the toolbar entirely (markdown shortcuts still work) —
   *  for tight surfaces like the detail-panel peek. Default true. */
  toolbar?: boolean
}

/** Imperative handle: move focus (caret at end) into the notes. */
export interface RichEditorHandle {
  focus: () => void
}

// Images embed as base64 data URIs inside the stored HTML, so the whole
// app stays one .sqlite3 file — no asset folder to lose in a backup. To
// keep the database sane we cap sources at 10MB and downscale/re-encode
// before embedding.
const MAX_IMAGE_SOURCE_BYTES = 10 * 1024 * 1024
const MAX_IMAGE_EDGE_PX = 1600

async function imageFileToDataUri(file: File): Promise<string | null> {
  if (file.size > MAX_IMAGE_SOURCE_BYTES) {
    console.warn(`RichEditor: image is ${file.size} bytes (>10MB), refusing to embed`)
    return null
  }
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new window.Image()
      el.onload = (): void => resolve(el)
      el.onerror = (): void => reject(new Error('undecodable image'))
      el.src = url
    })
    const scale = Math.min(1, MAX_IMAGE_EDGE_PX / Math.max(img.naturalWidth, img.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale))
    canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height)
    // PNG keeps transparency; everything else compresses far better as JPEG.
    return file.type === 'image/png'
      ? canvas.toDataURL('image/png')
      : canvas.toDataURL('image/jpeg', 0.85)
  } catch {
    console.warn('RichEditor: could not decode image, not embedding')
    return null
  } finally {
    URL.revokeObjectURL(url)
  }
}

// Shared by paste and drop. Inserts asynchronously (encoding takes a beat)
// but reports "handled" synchronously so ProseMirror doesn't also paste the
// raw file. `pos` anchors dropped images at the drop point.
function insertImageFiles(view: EditorView, files: File[], pos?: number): boolean {
  const images = files.filter((f) => f.type.startsWith('image/'))
  if (images.length === 0) return false
  for (const file of images) {
    void imageFileToDataUri(file).then((src) => {
      if (!src) return
      const node = view.state.schema.nodes.image.create({ src })
      const tr =
        pos !== undefined
          ? view.state.tr.insert(pos, node)
          : view.state.tr.replaceSelectionWith(node)
      view.dispatch(tr)
    })
  }
  return true
}

// Keep bullet lists (toolbar button, existing/pasted lists) but drop the
// "- " / "* " / "+ " input rule — typing a dash at line start should stay
// a dash, not silently become a bullet.
const BulletListNoAutoformat = BulletList.extend({
  addInputRules() {
    return []
  }
})

/**
 * Tab stays IN the document: in a list it nests the item (⇧Tab lifts),
 * in a code block it types a real tab, anywhere else it types an
 * indent — it never walks focus off to the next control. Tables keep
 * their own Tab (next cell): this extension steps aside there.
 * The indent is non-breaking spaces because plain spaces collapse when
 * the stored HTML is re-parsed on the next load.
 */
const TabIndent = Extension.create({
  name: 'tabIndent',
  addKeyboardShortcuts() {
    return {
      Tab: () => {
        if (this.editor.isActive('table')) return false // table nav wins
        if (this.editor.isActive('listItem')) {
          // Nesting may be impossible (first item) — swallow the key anyway.
          return this.editor.commands.sinkListItem('listItem') || true
        }
        if (this.editor.isActive('taskItem')) {
          return this.editor.commands.sinkListItem('taskItem') || true
        }
        if (this.editor.isActive('codeBlock')) {
          return this.editor.commands.insertContent('\t')
        }
        return this.editor.commands.insertContent('\u00A0\u00A0\u00A0\u00A0')
      },
      'Shift-Tab': () => {
        if (this.editor.isActive('table')) return false
        if (this.editor.isActive('listItem')) {
          return this.editor.commands.liftListItem('listItem') || true
        }
        if (this.editor.isActive('taskItem')) {
          return this.editor.commands.liftListItem('taskItem') || true
        }
        return true // swallowed — focus stays in the editor
      }
    }
  }
})

/**
 * Headings carry a persistent `collapsed` flag (data-collapsed in the
 * stored HTML), so a section folded on a canvas is still folded the
 * next time the document opens. The flag alone changes nothing —
 * HeadingFold below is what actually tucks the section away.
 */
const CollapsibleHeading = Heading.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      collapsed: {
        default: false,
        keepOnSplit: false,
        parseHTML: (el: HTMLElement) => el.getAttribute('data-collapsed') === 'true',
        renderHTML: (attrs: Record<string, unknown>) =>
          attrs.collapsed ? { 'data-collapsed': 'true' } : {}
      }
    }
  }
})

/** The document's top-level blocks plus which of them are folded away. */
function docFoldState(doc: PMNode): {
  blocks: Array<{ node: PMNode; pos: number }>
  hidden: Set<number>
  controller: Map<number, number>
} {
  const blocks: Array<{ node: PMNode; pos: number }> = []
  doc.forEach((node, offset) => blocks.push({ node, pos: offset }))
  return {
    blocks,
    ...foldState(
      blocks.map(({ node }) => ({
        level: node.type.name === 'heading' ? (node.attrs.level as number) : null,
        collapsed: Boolean(node.attrs.collapsed)
      }))
    )
  }
}

// The same wide open chevron the rest of the app draws (Today's
// Chevron component) — the ▾/▸ glyphs render comically small next to
// a heading's type.
const CHEVRON_OPEN =
  '<svg width="13" height="8" viewBox="0 0 16 9" aria-hidden="true"><path d="M1.5 1.5 L8 7.5 L14.5 1.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>'
const CHEVRON_CLOSED =
  '<svg width="8" height="13" viewBox="0 0 9 16" aria-hidden="true"><path d="M1.5 1.5 L7.5 8 L1.5 14.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>'

/** The chevron that hangs in a heading's left margin (hover to see it). */
function makeFoldToggle(view: EditorView, getPos: () => number | undefined, collapsed: boolean): HTMLElement {
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className = 'heading-fold'
  btn.contentEditable = 'false'
  btn.innerHTML = collapsed ? CHEVRON_CLOSED : CHEVRON_OPEN
  btn.title = collapsed ? 'Expand this section' : 'Collapse this section (until the next heading of this size)'
  btn.addEventListener('mousedown', (e) => {
    e.preventDefault()
    e.stopPropagation()
    const at = (getPos() ?? 0) - 1 // the widget sits just inside the heading
    const node = view.state.doc.nodeAt(at)
    if (!node || node.type.name !== 'heading') return
    const next = !node.attrs.collapsed
    let tr = view.state.tr.setNodeMarkup(at, undefined, { ...node.attrs, collapsed: next })
    // Folding must not strand the caret inside the section being
    // hidden — park it at the end of the heading's own text.
    if (next) tr = tr.setSelection(TextSelection.create(tr.doc, at + node.nodeSize - 1))
    view.dispatch(tr)
  })
  return btn
}

/**
 * Fold sections by their headings (SPEC-less nicety): each heading
 * wears a toggle, and a collapsed one hides every block up to the next
 * heading of the same or higher level. Decorations only — the hidden
 * text never leaves the document (or the stored HTML, or search).
 *
 * Only the FULL variant mounts this: compact surfaces (card notes)
 * clip the margin toggle, and a fold nobody can reach would trap
 * content — there, everything simply shows expanded.
 */
const HeadingFold = Extension.create({
  name: 'headingFold',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('headingFold'),
        props: {
          decorations(state) {
            const { blocks, hidden } = docFoldState(state.doc)
            const decos: Decoration[] = []
            blocks.forEach(({ node, pos }, i) => {
              if (node.type.name === 'heading' && node.content.size > 0) {
                const collapsed = Boolean(node.attrs.collapsed)
                decos.push(
                  Decoration.widget(
                    pos + 1,
                    (view, getPos) => makeFoldToggle(view, getPos, collapsed),
                    { side: -1, ignoreSelection: true }
                  )
                )
              }
              if (hidden.has(i)) {
                decos.push(Decoration.node(pos, pos + node.nodeSize, { class: 'hf-hidden' }))
              }
            })
            return DecorationSet.create(state.doc, decos)
          }
        },
        // The caret must never sit in a hidden block (arrow keys, ⌘End,
        // an Enter right after a folded heading) — auto-expand whatever
        // hides it, unwrapping nested folds one controller at a time.
        appendTransaction(trs, _old, state) {
          if (!trs.some((tr) => tr.docChanged || tr.selectionSet)) return null
          let tr: Transaction | null = null
          for (let guard = 0; guard < 8; guard++) {
            const doc = tr ? tr.doc : state.doc
            const sel = tr ? tr.selection : state.selection
            const { blocks, hidden, controller } = docFoldState(doc)
            const idx = blocks.findIndex(
              ({ node, pos }) => sel.from >= pos && sel.from < pos + node.nodeSize
            )
            if (idx === -1 || !hidden.has(idx)) break
            const ctl = blocks[controller.get(idx)!]
            tr = (tr ?? state.tr).setNodeMarkup(ctl.pos, undefined, {
              ...ctl.node.attrs,
              collapsed: false
            })
          }
          return tr
        }
      })
    ]
  }
})

const FONTS: Array<[label: string, css: string]> = [
  ['Default', ''],
  ['Serif', 'Georgia, serif'],
  ['Mono', 'ui-monospace, SFMono-Regular, Menlo, monospace'],
  ['Rounded', 'ui-rounded, "SF Pro Rounded", "Comic Sans MS", cursive']
]

export const RichEditor = forwardRef<RichEditorHandle, RichEditorProps>(function RichEditor(
  { initialHtml, placeholder, onChange, onExit, variant = 'full', toolbar = true },
  ref
): React.JSX.Element | null {
  // Kept in a ref so the editor's keydown handler (built once) always
  // sees the latest callback without rebuilding the editor.
  const onExitRef = useRef(onExit)
  onExitRef.current = onExit
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ bulletList: false, heading: false }),
      BulletListNoAutoformat,
      CollapsibleHeading,
      // Folding only where the toggle is reachable; elsewhere the
      // collapsed flag is inert and everything renders expanded.
      ...(variant === 'full' ? [HeadingFold] : []),
      TableKit.configure({ table: { resizable: false } }),
      TextStyleKit,
      TaskList,
      TaskItem.configure({ nested: true }),
      // base64 so the image lives in richContent (and thus SQLite);
      // block-level images read better in notes than inline ones.
      ImageExtension.configure({ allowBase64: true, inline: false }),
      TabIndent,
      Placeholder.configure({ placeholder: placeholder ?? 'Write anything…' })
    ],
    content: initialHtml,
    editorProps: {
      // Commit-and-exit when the caller wants it: plain ⏎ (or Esc)
      // closes; ⇧⏎ is the "stay inside" newline. Handled here (not
      // just via bubbling) because ProseMirror consumes the keydown
      // before it reaches the card's own handler.
      handleKeyDown: (_view, event): boolean => {
        if (!onExitRef.current) return false
        const exits =
          (event.key === 'Enter' && !event.shiftKey) || event.key === 'Escape'
        if (!exits) return false
        event.preventDefault()
        onExitRef.current()
        return true
      },
      handlePaste: (view, event): boolean =>
        insertImageFiles(view, Array.from(event.clipboardData?.files ?? [])),
      handleDrop: (view, event, _slice, moved): boolean => {
        if (moved) return false // internal drag of existing content — let PM move it
        const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos
        return insertImageFiles(view, Array.from(event.dataTransfer?.files ?? []), pos)
      }
    },
    // Note: getText() skips images, so the plain-text mirror callers keep
    // for search/preview simply won't mention them — acceptable.
    onUpdate: ({ editor }) => onChange(editor.getHTML(), editor.getText())
  })

  // Let callers drop the caret into the notes (e.g. ⏎ from the title).
  useImperativeHandle(ref, () => ({ focus: () => editor?.commands.focus('end') }), [editor])

  if (!editor) return null
  return (
    <div className={`rich-editor ${variant}`}>
      {toolbar && <Toolbar editor={editor} compact={variant === 'compact'} />}
      <EditorContent editor={editor} />
    </div>
  )
})

/**
 * One toolbar button: the fast viewport tooltip (not the ~1s native
 * `title`) names the action on its first line and shows the keyboard
 * shortcut, when the action has one, on the second.
 * mousedown + preventDefault keeps the text selection while clicking.
 */
function RtBtn({
  label,
  title,
  shortcut,
  run,
  active
}: {
  label: string
  title: string
  shortcut?: string
  run: () => void
  active: boolean
}): React.JSX.Element {
  const tip = useTip(tipLines(title, shortcut))
  return (
    <button
      type="button"
      className={`rt-btn ${active ? 'on' : ''}`}
      {...tip}
      onMouseDown={(e) => {
        e.preventDefault()
        run()
      }}
    >
      {label}
    </button>
  )
}

function Toolbar({ editor, compact }: { editor: Editor; compact: boolean }): React.JSX.Element {
  // Re-renders the buttons as the selection moves, so active marks light up.
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      underline: e.isActive('underline'),
      strike: e.isActive('strike'),
      h1: e.isActive('heading', { level: 1 }),
      h2: e.isActive('heading', { level: 2 }),
      h3: e.isActive('heading', { level: 3 }),
      bullet: e.isActive('bulletList'),
      ordered: e.isActive('orderedList'),
      task: e.isActive('taskList'),
      quote: e.isActive('blockquote'),
      code: e.isActive('codeBlock'),
      inTable: e.isActive('table'),
      font: (e.getAttributes('textStyle').fontFamily as string | undefined) ?? ''
    })
  })

  // Each button hovers to its name AND its keyboard shortcut — the
  // toolbar doubles as the legend, no help panel required.
  const btn = (
    label: string,
    title: string,
    run: () => void,
    active = false,
    shortcut?: string
  ): React.JSX.Element => (
    <RtBtn key={title} label={label} title={title} shortcut={shortcut} run={run} active={active} />
  )

  const chain = (): ReturnType<Editor['chain']> => editor.chain().focus()

  // Attach flow: hidden input so the 🖼 button can open the OS picker.
  const fileInput = useRef<HTMLInputElement>(null)
  const onImagePicked = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0]
    e.target.value = '' // so picking the same file again still fires change
    if (!file) return
    void imageFileToDataUri(file).then((src) => {
      if (src) editor.chain().focus().setImage({ src }).run()
    })
  }
  const imageControls = (
    <>
      {btn('🖼', 'Insert image', () => fileInput.current?.click())}
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={onImagePicked}
      />
    </>
  )

  if (compact) {
    return (
      <div className="rich-toolbar">
        {btn('B', 'Bold', () => chain().toggleBold().run(), state.bold, '⌘B')}
        {btn('I', 'Italic', () => chain().toggleItalic().run(), state.italic, '⌘I')}
        {btn('S̶', 'Strikethrough', () => chain().toggleStrike().run(), state.strike, '⌘⇧S')}
        <span className="rt-sep" />
        {btn('•', 'Bullet list', () => chain().toggleBulletList().run(), state.bullet, '⌘⇧8')}
        {btn('1.', 'Numbered list', () => chain().toggleOrderedList().run(), state.ordered, '⌘⇧7')}
        {btn('☑', 'Checklist', () => chain().toggleTaskList().run(), state.task, '⌘⇧9')}
        {btn('❝', 'Quote', () => chain().toggleBlockquote().run(), state.quote, '⌘⇧B')}
        {imageControls}
        <span className="rt-hint">md shortcuts work: # ** - [ ] &gt;</span>
      </div>
    )
  }

  return (
    <div className="rich-toolbar">
      {btn('H1', 'Heading 1', () => chain().toggleHeading({ level: 1 }).run(), state.h1, '⌘⌥1')}
      {btn('H2', 'Heading 2', () => chain().toggleHeading({ level: 2 }).run(), state.h2, '⌘⌥2')}
      {btn('H3', 'Heading 3', () => chain().toggleHeading({ level: 3 }).run(), state.h3, '⌘⌥3')}
      <span className="rt-sep" />
      {btn('B', 'Bold', () => chain().toggleBold().run(), state.bold, '⌘B')}
      {btn('I', 'Italic', () => chain().toggleItalic().run(), state.italic, '⌘I')}
      {btn('U', 'Underline', () => chain().toggleUnderline().run(), state.underline, '⌘U')}
      {btn('S̶', 'Strikethrough', () => chain().toggleStrike().run(), state.strike, '⌘⇧S')}
      <span className="rt-sep" />
      {btn('•', 'Bullet list', () => chain().toggleBulletList().run(), state.bullet, '⌘⇧8')}
      {btn('1.', 'Numbered list', () => chain().toggleOrderedList().run(), state.ordered, '⌘⇧7')}
      {btn('☑', 'Checklist', () => chain().toggleTaskList().run(), state.task, '⌘⇧9')}
      {btn('❝', 'Quote', () => chain().toggleBlockquote().run(), state.quote, '⌘⇧B')}
      {btn('</>', 'Code block', () => chain().toggleCodeBlock().run(), state.code, '⌘⌥C')}
      {imageControls}
      <span className="rt-sep" />
      {state.inTable ? (
        <>
          {btn('+row', 'Add row below', () => chain().addRowAfter().run())}
          {btn('+col', 'Add column after', () => chain().addColumnAfter().run())}
          {btn('−row', 'Delete row', () => chain().deleteRow().run())}
          {btn('−col', 'Delete column', () => chain().deleteColumn().run())}
          {btn('⌫ table', 'Delete table', () => chain().deleteTable().run())}
        </>
      ) : (
        btn('⊞ table', 'Insert a 3×3 table', () =>
          chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
        )
      )}
      <span className="rt-sep" />
      <select
        className="rt-font"
        title="Font"
        value={state.font}
        onChange={(e) => {
          const css = e.target.value
          if (css) editor.chain().focus().setFontFamily(css).run()
          else editor.chain().focus().unsetFontFamily().run()
        }}
      >
        {FONTS.map(([label, css]) => (
          <option key={label} value={css}>
            {label}
          </option>
        ))}
      </select>
      <span style={{ marginLeft: 'auto' }} />
      {btn('↩', 'Undo', () => chain().undo().run(), false, '⌘Z')}
      {btn('↪', 'Redo', () => chain().redo().run(), false, '⇧⌘Z')}
    </div>
  )
}
