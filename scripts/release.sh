#!/usr/bin/env bash
set -euo pipefail

release_type=${1:-patch}

if [[ "$release_type" != "patch" && "$release_type" != "minor" && "$release_type" != "major" ]]; then
  echo "Usage: $0 [patch|minor|major]" >&2
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Working tree is not clean. Commit or stash your changes." >&2
  exit 1
fi

pnpm version "$release_type" --no-git-tag-version

git add package.json pnpm-lock.yaml

version=$(node -p "require('./package.json').version")
git commit -m "release: bump version to v$version"

tag="v$version"
git tag -f "$tag"

git push

git push -f origin "refs/tags/$tag"

echo "Released $tag"
