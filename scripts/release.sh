#!/bin/bash
set -e

VERSION_TYPE=${1:-patch}

if [[ ! "$VERSION_TYPE" =~ ^(patch|minor|major)$ ]]; then
  echo "Usage: ./scripts/release.sh [patch|minor|major]"
  exit 1
fi

bun run typecheck && bun run build && bun test

NEW_VERSION=$(npm version "$VERSION_TYPE" --no-git-tag-version)
git add package.json
git commit -m "chore: release $NEW_VERSION"
git tag -a "$NEW_VERSION" -m "Release $NEW_VERSION"
git push origin main
git push origin "$NEW_VERSION"
gh release create "$NEW_VERSION" --generate-notes
