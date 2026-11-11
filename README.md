# Agents-Driven Flow

Repo: `agents-review` (public). Project name may change.

A test project to learn how to build software with AI agents. Agents do most of the development; I act as tech lead: I write issues, set the rules, review and merge. The app itself is small on purpose. The point is the agent setup around it.

Full plan: [docs/_project-plan.md](docs/_project-plan.md). This README is the short version.

## What the app does
A small audience sync tool:
- Users build an audience from customer data in a filter builder (e.g. "purchased in last 30 days AND country = DE") with a live count and a member table.
- A sync worker sends the audience in batches to a mock ad platform that rate-limits and fails some requests. Retries with backoff, idempotent writes.
- A run history page shows each sync with status, counts and errors.

## Architecture
One monorepo (pnpm workspaces + Turborepo) with 6 packages today and a 7th planned:
- `apps/web`: React app (audience builder, member table, run history)
- `apps/api`: GraphQL API (schema-first)
- `services/sync-worker`: sends audiences to the ad platform in batches
- `services/mock-destination`: fake ad platform with rate limits and random failures
- `packages/shared`: GraphQL schema and shared types
- `packages/db`: database schema, migrations and seed
- `tools/mcp-dev` (planned, Phase 6): custom MCP server that gives agents CI logs and sync-run data

Postgres runs in Docker Compose with about 100k seeded rows. Nothing is hosted. Everything runs locally, in the dev container and in CI.

Local ports (defaults, all set from env so parallel worktrees can shift them): web 5173, API 4000, mock ad platform 4100, Postgres 5432.

## Prerequisites
Install these first:

| Tool | Version | Get it |
|---|---|---|
| Node.js | 26 | [nodejs.org](https://nodejs.org) or a version manager like nvm or fnm (the repo's `.nvmrc` says 26) |
| pnpm | 12 | [pnpm.io/installation](https://pnpm.io/installation) |
| Docker | with Compose (`docker compose`) | [Docker Desktop](https://www.docker.com/products/docker-desktop/) on Windows and macOS, Docker Engine on Linux |
| Git | any recent | [git-scm.com](https://git-scm.com) |

Then run the first-time setup command from [AGENTS.md](AGENTS.md#commands). On Windows, run it in Git Bash or PowerShell 7, because it uses `cp` and `&&`.

## Dev container (optional)
Use it when Claude should work on its own, without you approving each step, for example a long task or a batch of test runs. Claude then works in a sealed-off container:
- it sees only a separate copy of the repo, not your working copy or other files;
- it can only reach GitHub, npm, Anthropic and the VS Code Marketplace;
- it has only the tokens you paste in, not your own logins.

For everyday development you don't need it, and the normal setup above stays as it is.

Works on Windows (WSL 2) + Docker Desktop, macOS (Intel and Apple Silicon) + Docker Desktop, and Linux + Docker Engine. Podman and rootless Docker are untested.

**First time on a machine?** Do the one-time setup in [.devcontainer/README.md](.devcontainer/README.md): Docker, the devcontainer CLI, and your tokens.

All commands below run in **a terminal on your computer**: on Windows, the **Ubuntu (WSL)** terminal, not PowerShell; on macOS and Linux, your usual terminal.

**Start**
1. Once: clone a separate copy. Never use your everyday checkout: its `node_modules` has binaries for your computer, and the agent must not touch your working copy.
   ```bash
   git clone https://github.com/MiselKING/agents-review.git ~/agents-review
   ```
2. Paste your tokens. They stay in this terminal only and are never saved, so paste them again in each new terminal. Skip the GitHub one if runs don't need to push.
   ```bash
   read -rsp "Claude token: " CLAUDE_CODE_OAUTH_TOKEN && export CLAUDE_CODE_OAUTH_TOKEN
   
   read -rsp "GitHub token: " GH_TOKEN && export GH_TOKEN
   ```
3. Start the container:
   ```bash
   devcontainer up --workspace-folder ~/agents-review
   ```
   The first start builds the image and sets up the project (about 5 minutes). Later starts take seconds.

**Run Claude** (same terminal, so it gets the tokens):
```bash
devcontainer exec --workspace-folder ~/agents-review claude -p "Summarize what apps/api does" --max-turns 10
```
`-p` runs can run the project checks (`pnpm lint`, `pnpm test` and the others in AGENTS.md) without prompts. Anything that would need your approval is denied.
For a shell inside the container: `devcontainer exec --workspace-folder ~/agents-review bash` (`exit` to leave). Only `devcontainer exec` from a terminal with the tokens passes them in; VS Code terminals don't get them.

**Stop:** `docker compose -p agents-review_devcontainer stop`. To start again, do steps 2 and 3.

**Remove everything:** the containers, the database, the Claude config, the image, then the clone:
```bash
docker compose -p agents-review_devcontainer down -v --rmi local
rm -rf ~/agents-review
```
`agents-review_devcontainer` is the clone's folder name plus `_devcontainer`. Change it if your clone has another name.

**Upgrades:** Chromium and Claude Code are built into the image. After a Playwright upgrade, set the playwright feature's `version` in `.devcontainer/devcontainer.json` and the Playwright image in `.github/workflows/ci.yml`; for Claude Code, set `CLAUDE_CODE_VERSION` in `.devcontainer/compose.yaml`. Then rebuild: `devcontainer up --workspace-folder ~/agents-review --remove-existing-container`.

**Risks**
- Anything inside can leave through the allowed hosts, e.g. by pushing to GitHub.
- The firewall looks up the allowed hosts' IPs only at startup. If one changes its IPs, restart the container.
- VS Code, while connected, passes your own Git login into the container. See [.devcontainer/README.md](.devcontainer/README.md#vs-code-optional) before using it.

## The agent setup
Flow: issue → agent builds on a branch → draft PR → CI → AI review → my review → merge. Agents never merge. Failed CI or requested changes go back to the agent.
- Agents: Claude Code (main, local + Claude Code Action in GitHub), Copilot cloud agent (comparison, 30-day Pro trial)
- Reviewers: Claude, CodeRabbit, Copilot code review (about 5 PRs)
- Agent config: AGENTS.md (rules for every agent), CLAUDE.md (`@AGENTS.md`), `.claude/settings.json` (Claude permissions: what's blocked and what needs approval), REVIEW.md, skills, hooks in `.claude/hooks/` (lint after each edit, lint and typecheck before Claude finishes), `.mcp.json`, dev container with a default-deny firewall, where agents can't edit agent config. For all agents, GitHub rulesets on `main` and CI checks are what enforce the rules. Details in the plan.
- Writing issues: the issue forms on GitHub, or `/write-issue` in Claude Code with short notes (format in `.claude/skills/write-issue/SKILL.md`)
- Side flows: Renovate dependency PRs, weekly docs sync, visual change requests
- Measurement: 12 fixed tasks, run with a bare setup (Phase 4) and the full setup (Phase 7), 2 runs each
- All tools free on a public repo. The only licensed extra is the Copilot Pro trial.

## Decisions
- Compose runs Postgres only; `pnpm dev` runs the apps and services
- Commits follow Conventional Commits
- One-time setup rules (ports from env, Vite `strictPort`, `/graphql` proxy) live in the scaffold issue, not in AGENTS.md
- Seed data comes with the data model in Phase 3; the Phase 1 scaffold has no tables

## Core packages (checked 2026-11-08)

Installed versions are pinned in `package.json` files and `pnpm-lock.yaml`; this table is the overview.

| Package | Version | What it does | Why this one |
|---|---|---|---|
| Node.js | 26 (LTS) | Runtime for the API, services and tooling | Runs TypeScript directly (type stripping) and loads `.env` itself, so no tsx or dotenv |
| pnpm | 12 | Installs dependencies; workspaces link the packages together | Strict (no undeclared deps), fast, built-in monorepo support. |
| Turborepo | 2.x | Runs scripts (test, lint, build) across all packages | Runs in dependency order and in parallel, and skips packages that didn't change |
| TypeScript | 7 | Language and type checker | New native compiler, about 10x faster type checks |
| React + Vite | Vite 8 | UI library + dev server and bundler | Standard choice; Vite 8 builds with Rolldown (Rust), much faster builds |
| TanStack Query | 5 | Fetches and caches server data in the UI | Handles caching, refetching and pagination so the UI code stays small |
| graphql (graphql-js) | 17 | GraphQL reference implementation used by Yoga and codegen | Required peer of both; current major |
| GraphQL Yoga | 6 | GraphQL server for the API | Light, built on the standard Fetch API, same team as GraphQL Code Generator |
| GraphQL Code Generator | CLI 8, plugins 7 | Generates resolver types for the API and typed queries for the UI | API and UI share one typed contract; CI checks it's up to date. The UI calls the API with a small `fetch` wrapper inside TanStack Query, no extra GraphQL client |
| DataLoader | not installed yet | Batches database lookups in resolvers | Avoids one query per row (the N+1 problem). Added with the first resolver that reads the database |
| Drizzle ORM + drizzle-kit | 0.45 / 0.31 (stable) | Database queries + SQL migrations | SQL-first, good for dynamic filters; schema in TypeScript; reviewable SQL migrations. Upgrade to 1.0 once it's stable |
| node-postgres (pg) | 8 | Postgres driver for Drizzle | The standard Node driver; drizzle-kit uses it too |
| PostgreSQL | 18 via Docker | Database | Standard; runs locally and in CI at no cost |
| Vitest | 5 | Unit and integration tests | Fast, Vite-native. Each package has its own config |
| Playwright | 1.65 | End-to-end tests and screenshots | Agents use screenshots to check UI changes |
| Oxlint (+ tsgolint) | 1.x / 7 | Linting, including type-aware rules | Works with TypeScript 7 (typescript-eslint doesn't yet); much faster than ESLint |
| Oxfmt | 0.77 (beta) | Code formatting | Prettier-compatible output, much faster. Prettier is the fallback if it causes trouble |