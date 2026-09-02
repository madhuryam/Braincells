/**
 * Service → icon image, for link chips. THE mapping to edit when
 * swapping in real logos: drop a PNG/JPEG into assets/link-icons/
 * (any square size — chips render it at 16px) and point the import
 * at it. The current files are solid-color placeholders in
 * brand-adjacent colors, named after their linkServices.ts keys.
 */
import chatgpt from './assets/link-icons/chatgpt.png'
import claude from './assets/link-icons/claude.png'
// import claude from './assets/link-icons/claude2.png'
import confluence from './assets/link-icons/confluence.png'
import figma from './assets/link-icons/figma.png'
import gcal from './assets/link-icons/gcal.png'
import gdocs from './assets/link-icons/gdocs.png'
import gdrive from './assets/link-icons/gdrive.png'
import github from './assets/link-icons/github.png'
import gmail from './assets/link-icons/gmail.png'
import gsheets from './assets/link-icons/gsheets.png'
import gslides from './assets/link-icons/gslides.png'
import jira from './assets/link-icons/jira.png'
import linear from './assets/link-icons/linear.png'
import loom from './assets/link-icons/loom.png'
import meet from './assets/link-icons/meet.png'
import notion from './assets/link-icons/notion.png'
import slack from './assets/link-icons/slack.png'
import teams from './assets/link-icons/teams.png'
import zoom from './assets/link-icons/zoom.png'
import { linkService, type LinkServiceKey } from './linkServices'

const ICONS: Record<LinkServiceKey, string> = {
  slack,
  gdrive,
  gdocs,
  gsheets,
  gslides,
  gmail,
  gcal,
  confluence,
  jira,
  github,
  figma,
  notion,
  linear,
  zoom,
  loom,
  claude,
  chatgpt,
  meet,
  teams
}

/** The icon for a URL's service, or null → the caller shows 🔗. */
export function linkIcon(url: string): string | null {
  const key = linkService(url)
  return key ? ICONS[key] : null
}
