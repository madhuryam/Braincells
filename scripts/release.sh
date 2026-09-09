#!/usr/bin/env bash
# Cut a release — the one path every version ships through.
# Usage: npm run release -- patch|minor|major   (see docs/RELEASE.md)
set -euo pipefail
cd "$(dirname "$0")/.."

BUMP="${1:-}"
if [[ ! "$BUMP" =~ ^(patch|minor|major)$ ]]; then
  echo "usage: npm run release -- patch|minor|major"
  exit 1
fi

# 1. Releases cut from a clean main — every feature already an atomic
#    commit of its own (fixes amended in, never stacked on top).
BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [[ "$BRANCH" != "main" ]]; then
  echo "✗ on '$BRANCH' — releases cut from main"
  exit 1
fi
if [[ -n "$(git status --porcelain)" ]]; then
  echo "✗ working tree not clean — commit or stash first"
  exit 1
fi

# 2. The version this release will become, computed without applying.
NEXT=$(node -e '
  const [maj, min, pat] = require("./package.json").version.split(".").map(Number)
  const b = process.argv[1]
  console.log(
    b === "major" ? `${maj + 1}.0.0` : b === "minor" ? `${maj}.${min + 1}.0` : `${maj}.${min}.${pat + 1}`
  )
' "$BUMP")

# 3. The changelog tells this version's story BEFORE the cut.
if ! grep -Eq "^## v${NEXT//./\\.} " CHANGELOG.md; then
  echo "✗ CHANGELOG.md has no \"## v$NEXT — YYYY-MM-DD\" section yet."
  echo "  Write what changed (newest at the top), commit it, then rerun."
  exit 1
fi

# 4. Nothing ships red.
npm run typecheck
npm test

# 5. The version commit ("XX.YY.ZZ") and tag (vXX.YY.ZZ), matching every
#    release before it.
npm version "$BUMP" -m "%s"

# 6. The distributable.
npm run dist

# 7. Out the door. (SSH signing may need your terminal — if this step
#    fails, run it yourself: git push origin main --follow-tags)
git push origin main --follow-tags

echo "✓ released v$NEXT — dist/braincells-$NEXT-arm64.dmg"
