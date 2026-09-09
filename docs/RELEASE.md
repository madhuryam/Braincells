# Cutting a release

The whole process is one command once the ground rules below are met:

```sh
npm run release -- patch   # or minor / major
```

## The ground rules (what the script checks)

1. **Atomic commits, always.** During development every feature lands
   as exactly one commit on `main`; follow-up fixes to unreleased work
   are amended (or squashed) into their feature's commit, never stacked
   on top. Nothing is committed until the change is approved. The
   release script refuses a dirty tree or a non-`main` branch.

2. **The changelog is written first.** `CHANGELOG.md` must already have
   a section for the version being cut, newest at the top:

   ```markdown
   ## v1.2.0 — 2026-09-15

   - **Headline change.** What it does, in a sentence a future you
     will understand.
   ```

   Commit the changelog update as its own `docs(changelog): v1.2.0`
   commit before running the release. The script computes the next
   version from the bump type and refuses to cut if its section is
   missing.

3. **Nothing ships red.** The script runs `npm run typecheck` and
   `npm test` and stops on any failure.

## What the script then does

4. `npm version <bump>` — bumps `package.json`, makes the version
   commit (message is just the number, e.g. `1.2.0`), and tags it
   `v1.2.0`. This is also the version Settings shows at its foot
   (via `app.getVersion()`).
5. `npm run dist` — builds `dist/braincells-<version>-arm64.dmg`
   (unsigned; Gatekeeper right-click-open applies).
6. `git push origin main --follow-tags` — publishes the commits and
   the tag. **SSH signing may need an interactive prompt** — if the
   push fails from a non-interactive shell, run
   `git push origin main --follow-tags` in your own terminal; the
   release is otherwise complete.

## Picking the bump

- **patch** — fixes and small polish on existing behavior.
- **minor** — new features (most feature batches land here… in
  practice the version has tracked the in-app "New in vX.Y.Z" canvas,
  so pick whatever matches the story being told).
- **major** — reserved for a rethink.
