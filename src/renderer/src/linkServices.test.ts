import { describe, expect, it } from 'vitest'
import { linkService } from './linkServices'

describe('linkService (URL → service icon key)', () => {
  it('detects Slack workspaces and slack.com itself', () => {
    expect(linkService('https://acme.slack.com/archives/C123/p456')).toBe('slack')
    expect(linkService('https://slack.com/intl/en-gb/help')).toBe('slack')
  })

  it('splits the Google suite by host and path', () => {
    expect(linkService('https://drive.google.com/drive/folders/abc')).toBe('gdrive')
    expect(linkService('https://docs.google.com/document/d/abc/edit')).toBe('gdocs')
    expect(linkService('https://docs.google.com/spreadsheets/d/abc/edit#gid=0')).toBe('gsheets')
    expect(linkService('https://docs.google.com/presentation/d/abc/edit')).toBe('gslides')
    expect(linkService('https://mail.google.com/mail/u/0/#inbox/xyz')).toBe('gmail')
    expect(linkService('https://calendar.google.com/calendar/u/0/r')).toBe('gcal')
  })

  it('tells Confluence from Jira on Atlassian cloud by path', () => {
    expect(linkService('https://acme.atlassian.net/wiki/spaces/ENG/pages/1')).toBe('confluence')
    expect(linkService('https://acme.atlassian.net/browse/ENG-123')).toBe('jira')
    expect(linkService('https://acme.atlassian.net/jira/software/projects/ENG/boards/1')).toBe('jira')
    // Self-hosted subdomain conventions still resolve.
    expect(linkService('https://jira.acme.com/browse/ENG-1')).toBe('jira')
    expect(linkService('https://confluence.acme.com/display/ENG')).toBe('confluence')
  })

  it('covers the rest of the everyday set', () => {
    expect(linkService('https://github.com/acme/repo/pull/1')).toBe('github')
    expect(linkService('https://www.figma.com/file/abc/Design')).toBe('figma')
    expect(linkService('https://www.notion.so/acme/Page-abc')).toBe('notion')
    expect(linkService('https://acme.notion.site/Page-abc')).toBe('notion')
    expect(linkService('https://linear.app/acme/issue/ENG-1')).toBe('linear')
    expect(linkService('https://acme.zoom.us/j/123456')).toBe('zoom')
    expect(linkService('https://www.loom.com/share/abc')).toBe('loom')
    expect(linkService('https://claude.ai/chat/abc')).toBe('claude')
    expect(linkService('https://chatgpt.com/c/abc')).toBe('chatgpt')
    expect(linkService('https://chat.openai.com/c/abc')).toBe('chatgpt')
    expect(linkService('https://meet.google.com/abc-defg-hij')).toBe('meet')
    expect(linkService('https://teams.microsoft.com/l/meetup-join/xyz')).toBe('teams')
  })

  it('falls back to null for unknown hosts and junk', () => {
    expect(linkService('https://example.com/page')).toBeNull()
    expect(linkService('not a url')).toBeNull()
    // Lookalike hosts must not match by substring.
    expect(linkService('https://notslack.com/x')).toBeNull()
    expect(linkService('https://github.com.evil.com/x')).toBeNull()
  })
})
