# Link-service icons

One square PNG/JPEG per service, rendered at 16px inside link chips.
Every file here is currently a **solid-color placeholder** — replace it
with the real logo (same filename, any square size) and the chips pick
it up on the next build. The URL → service detection lives in
`src/renderer/src/linkServices.ts`; the file mapping in
`src/renderer/src/linkIcons.ts`.

| File             | Service         |
| ---------------- | --------------- |
| `slack.png`      | Slack           |
| `gdrive.png`     | Google Drive    |
| `gdocs.png`      | Google Docs     |
| `gsheets.png`    | Google Sheets   |
| `gslides.png`    | Google Slides   |
| `gmail.png`      | Gmail           |
| `gcal.png`       | Google Calendar |
| `confluence.png` | Confluence      |
| `jira.png`       | Jira            |
| `github.png`     | GitHub          |
| `figma.png`      | Figma           |
| `notion.png`     | Notion          |
| `linear.png`     | Linear          |
| `zoom.png`       | Zoom            |
| `loom.png`       | Loom            |
| `claude.png`     | Claude          |
| `chatgpt.png`    | ChatGPT         |
| `meet.png`       | Google Meet     |
| `teams.png`      | Microsoft Teams |

To support a NEW service: add its key + hostname rule in
`linkServices.ts`, drop the image here, and add one import + map line
in `linkIcons.ts`.
