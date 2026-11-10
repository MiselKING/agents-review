#!/usr/bin/env bash
# First-time setup inside the dev container. Postgres already runs as a Compose service,
# so there's no `docker compose up -d` here.
set -euo pipefail

git config --global --add safe.directory /workspace

[ -f .env ] || cp .env.example .env
pnpm install --frozen-lockfile
pnpm db:migrate
pnpm db:seed

# Chromium is baked into the image for one Playwright version. If the lockfile moved on,
# `pnpm test:e2e` would try to download a new browser and hit the firewall.
image_version="$(cat "${PLAYWRIGHT_BROWSERS_PATH}/.playwright-version")"
locked_version="$(node -p "require('./apps/web/node_modules/@playwright/test/package.json').version")"
if [ "${image_version}" != "${locked_version}" ]; then
  echo "WARNING: the image has Playwright ${image_version}, but the lockfile has ${locked_version}." >&2
  echo "Update the playwright feature version in .devcontainer/devcontainer.json and rebuild." >&2
fi
