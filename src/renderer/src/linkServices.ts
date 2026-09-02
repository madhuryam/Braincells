/**
 * Which service a URL belongs to — Slack, the Google suite, Jira,
 * Confluence, … — so a link chip can wear the right icon instead of a
 * generic 🔗. Pure hostname/path sniffing, no network: the mapping
 * from key to image lives in linkIcons.ts (this file stays free of
 * asset imports so it runs — and tests — outside the bundler).
 */
export type LinkServiceKey =
  | 'slack'
  | 'gdrive'
  | 'gdocs'
  | 'gsheets'
  | 'gslides'
  | 'gmail'
  | 'gcal'
  | 'confluence'
  | 'jira'
  | 'github'
  | 'figma'
  | 'notion'
  | 'linear'
  | 'zoom'
  | 'loom'
  | 'claude'
  | 'chatgpt'
  | 'meet'
  | 'teams'

export function linkService(url: string): LinkServiceKey | null {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return null
  }
  const host = u.hostname.replace(/^www\./, '').toLowerCase()
  const path = u.pathname

  if (host === 'slack.com' || host.endsWith('.slack.com')) return 'slack'
  if (host === 'drive.google.com') return 'gdrive'
  // docs.google.com hosts the whole suite — the path says which app.
  if (host === 'docs.google.com') {
    if (path.startsWith('/spreadsheets')) return 'gsheets'
    if (path.startsWith('/presentation')) return 'gslides'
    return 'gdocs'
  }
  if (host === 'sheets.google.com') return 'gsheets'
  if (host === 'slides.google.com') return 'gslides'
  if (host === 'mail.google.com') return 'gmail'
  if (host === 'calendar.google.com') return 'gcal'
  if (host === 'meet.google.com') return 'meet'
  // Atlassian cloud: one host serves both — /wiki is Confluence,
  // everything else (boards, /browse/KEY-1) is Jira.
  if (host.endsWith('.atlassian.net')) return path.startsWith('/wiki') ? 'confluence' : 'jira'
  if (host === 'jira' || host.startsWith('jira.')) return 'jira'
  if (host === 'confluence' || host.startsWith('confluence.')) return 'confluence'
  if (host === 'github.com' || host.endsWith('.github.com')) return 'github'
  if (host === 'figma.com') return 'figma'
  if (host === 'notion.so' || host.endsWith('.notion.so') || host.endsWith('.notion.site'))
    return 'notion'
  if (host === 'linear.app') return 'linear'
  if (host === 'zoom.us' || host.endsWith('.zoom.us')) return 'zoom'
  if (host === 'loom.com') return 'loom'
  if (host === 'claude.ai') return 'claude'
  if (host === 'chatgpt.com' || host === 'chat.openai.com') return 'chatgpt'
  if (host === 'teams.microsoft.com' || host === 'teams.live.com') return 'teams'
  return null
}
