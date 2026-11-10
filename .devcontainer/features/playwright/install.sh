#!/usr/bin/env bash
# Runs as root at image build, after the Node feature.
set -euo pipefail

: "${VERSION:?}"
export PATH="/usr/local/share/nvm/current/bin:${PATH}"
export PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

pnpm dlx "playwright@${VERSION}" install --with-deps chromium

# post-create.sh compares this with the locked @playwright/test version.
echo "${VERSION}" > "${PLAYWRIGHT_BROWSERS_PATH}/.playwright-version"
# `playwright install` (run by `pnpm test:e2e`) takes a lock in this folder even when the
# browser is already there, so the container user must be able to write to it.
chown -R "${_REMOTE_USER:-vscode}:" "${PLAYWRIGHT_BROWSERS_PATH}"

rm -rf /root/.cache/pnpm /root/.local/share/pnpm /var/lib/apt/lists/*
