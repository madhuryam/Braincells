# Changelog

What changed in each release of braincells, newest first. Updated by
hand as part of cutting a release — the process lives in
[docs/RELEASE.md](docs/RELEASE.md). Versions 1.0.6–1.0.8 originally
shipped without git tags; their tags were added retroactively, dated
to their version commits.

## v1.3.0 — 2026-09-12

- **Signals are per day.** Slots 1–5 are keyed by the task's scheduled
  day, so lining up tomorrow's signals never touches today's. Claiming
  an occupied slot bumps its holder down one instead of evicting it
  (with all five taken, old 5 drops back to a plain task). When
  unfinished signals carry into a day whose slots are already spoken
  for, nothing auto-shuffles — a reconcile prompt lists the merged
  pool and you pick, in order, what keeps today's five; the rest
  demote. Finishing (or dropping) a signal promotes the quieter ones
  up: finish ⚡1 and ⚡2 is the new ⚡1.
- **Check and uncheck are undoable.** Everywhere — card, subtask row,
  task peek, done log. Undoing an accidental uncheck re-completes on
  the original timestamp, so old completions return to the right day
  in the log.
- **Reschedule from the right-click menu.** "↷ move to" offers the
  rolling window and upcoming weeks (landing on their Monday) without
  opening the editor. The menu and the task peek also show a quiet
  "created …" provenance line.
- **Dropped tasks take their time blocks with them.** Deleting a task
  from its block's peek used to leave the block on the timeline;
  linked blocks now hide with the dropped task (and come back if the
  drop is undone).

## v1.2.0 — 2026-09-09

- **Ad-hoc meetings on a second calendar.** Settings names the
  subscribed calendar ("Connected to … — read-only") and offers a
  separate WRITABLE calendar for huddles and calls. Drawing a range on
  the timeline now has a task | meeting toggle: meeting mode creates a
  real Google event (with a project, via the same filing meetings
  use), opens it immediately, and it behaves like any meeting — prep,
  follow-ups, notes. A mistyped task converts via right-click ("Make
  it a meeting"); ad-hoc meetings delete from their peek's title bar.
  Every write is pinned to the writable calendar and re-verified
  against Google's calendar list — the subscribed calendar is never
  written to.
- **Signals: the five "what happens next" tasks.** Right-click a task
  card, subtask row, or use the task peek to claim priority slot 1–5
  (one task per slot — claiming takes it over, which is the cap). A
  golden wash scales with loudness; a signaled subtask floats its
  parent to the top of its subsection without highlighting it; the ⚡
  button filters the day to signals only. Finishing a task frees its
  slot.
- **Canvas archive.** 🗄 on a canvas (title bar, or right-click on the
  project page) shelves it: read-only until unarchived, in a collapsed
  Archived list on its project page, out of the sidebar's canvas menu.
- **⌘Z always undoes the LAST thing.** Every destructive action now
  logs its inverse — remove-from-calendar rebuilds all its blocks,
  meeting unlinks restore the due date, batch triage restores every
  item, drag-drops return to the previous home, and more. (The bug:
  removing from calendar wasn't logged, so ⌘Z undid something older.)
- **Settings is a popup** — over wherever you are, with categories
  down the left (Appearance, Time & timeline, Chime, Calendar, labels,
  Backup & reset, Deleted canvases); the version sits at the rail's
  foot.
- **Task peek polish.** Controls share the title line (delete 🗑 with
  a two-step confirm, the new overlapping-windows popup icon, ✕), and
  an empty peek no longer opens pre-scrolled — notes start modest and
  grow.

## v1.1.1 — 2026-09-02

- **Timeline right-click works from any day.** The block menu now finds
  its task even on past days (carried-over tasks live on today, which
  used to leave the menu empty). Checking off from a past day records
  the completion on that day, and old blocks show their ✓ and project
  color correctly.
- **File from the timeline.** The block menu assigns a project, then —
  when the project has any — one of its sections, without leaving the
  schedule.
- **Next week / week after replace someday.** The card editor and the
  selection bar schedule whole weeks past the 5-day window; both pin to
  that week's Monday. Coming up ends with matching Monday–Sunday groups
  that accept drops and quick-adds.
- **Coming up rests folded** — the section and each day inside it, with
  count pills on folded headers. The No-project group now leads the
  day's list instead of trailing it.
- **Links are iconed cards.** Link chips grew into rounded cards with
  the service's icon (Slack, Drive/Docs/Sheets/Slides, Gmail, Calendar,
  Meet, Confluence, Jira, GitHub, Figma, Notion, Linear, Zoom, Loom,
  Claude, ChatGPT, Teams), the name in real weight, and the hostname
  whispered after.
- **Task peek notes match a meeting's.** One shared Notes section, and
  the editor fills the panel instead of clipping to a card-sized strip.
- **Canvas: fold sections by their headings.** Each heading wears a
  chevron; collapsing hides everything to the next heading of the same
  or higher size, persists across reopens, and can never strand the
  caret in hidden text.
- **Canvas: toolbar hovers name the shortcut** — every formatting
  button's tooltip shows its keys.

## v1.1.0 — 2026-08-27

- **Canvas trash.** Deleting a canvas is a soft delete with a 30-day
  trash; the project pill on a canvas refiles it.
- **Canvas: Tab stays in the document** — nesting lists, indenting text,
  real tabs in code blocks — and the formatting shortcuts got a legend.
- **A log you can read.** Done tasks render plain (no strikethrough),
  the log gains a by-week view, and the toggles quieted down.
- **One shared subtask tree** — full parity in the task peek, and
  collapsible on cards.
- **Timeline block menu** marks tasks done in place; drags undo with
  ⌘Z; the quick-add files into sections.
- **Right-click the day header** to jump straight to any date.
- **Auto-collapse sidebar rail** — hover to expand, 📌 to pin open.
- **Forward button** — history keeps its future after going back.
- **Offline calendar fetches fail quietly**, serving last-known events.

## v1.0.10 — 2026-08-18

- **Missed time blocks stay on the old day's timeline** when their task
  rolls forward — past days keep their record.

## v1.0.9 — 2026-08-18

- **Right-click menus on the timeline**; a task's extra blocks mirror
  its own block.
- **Task peeks edit in place** — notes, links, and the title.
- **Collapsible sections inside project blocks** on Today; right-click
  a section header to add a task straight into it.
- **Calendar events show more**: descriptions, a join-call 📞, and a 🗝️
  on private events.
- **A teeny interval chime** to nudge logging the day.
- Time-on-calendar totals moved off cards into detail views; new
  unsectioned tasks land at the top of General.

## v1.0.8 — 2026-08-13

- **Meeting prep picker** — attach existing tasks as prep — plus
  attached links on meetings and a tidier prep list.
- The schedule opens scrolled to now, mid-viewport; dropping a task on
  a meeting reliably attaches it as prep.

## v1.0.7 — 2026-08-13

- The schedule peek's ↗/✕ buttons take clicks anywhere; typing "- " in
  notes stays a dash instead of auto-bulleting.

## v1.0.6 — 2026-08-13

- The schedule peek fixes to the viewport, always in view.

## v1.0.5 — 2026-08-12

- Empty sections tuck behind a ∅/○ chip; canvases become preview cards
  and the canvas peek becomes a full page.

## 1.0.4 — 2026-08-12

- Archived sections shelve their tasks, a fold-all chevron packs up the
  day, and placed tasks fade once they hold a time block.

## 1.0.3 — 2026-08-11

- Declined meetings drop off the schedule, Done reads by project, and
  sections can archive.

## 1.0.2 — 2026-08-11

The first cut. Everything up to here, in broad strokes:

- **Today**: top tasks with carry-over, a minute-accurate timeline of
  events and time blocks (draw to create, drag to move), day paging,
  per-day quick-add, project blocks, the 5-day rolling scheduling
  window, and peeks for meetings and tasks beside the schedule.
- **Capture & triage**: global ⌥Space capture with shorthand, an inbox
  with single-keystroke triage (and bankruptcy), multi-select with a
  floating action bar.
- **Projects**: pages, sections, nicknames, colors, drag-to-reorder,
  archive/restore, type-the-name deletion, starred items.
- **Meetings**: Google Calendar (read-only OAuth), label colors that
  file meetings into projects, prep checklists whose items come due at
  the meeting, notes, and follow-ups that are real tasks immediately.
- **Notes & pages**: rich-text canvases (headings, tables, checklists,
  images, fonts) that format as you type.
- **Subtasks** to any depth, blocked-by dependencies, undo toasts with
  ⌘Z, FTS5 search under ⌘K, the daily/weekly log with a journal,
  backups with markdown export and restore, seven themes, and the
  whole SQLite data layer under test.
