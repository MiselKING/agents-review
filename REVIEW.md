# Review instructions

How to review a pull request in this repo. For Claude, CodeRabbit and Copilot review. AGENTS.md holds the project rules; this file says what to check and how serious it is.

## Three passes

Read the PR description and the issue it closes first, then make three passes over the diff.

1. **Bugs.** Wrong logic, unhandled errors, races, off-by-one, broken edge cases (empty audience, zero members, a retry after a partial failure). In the sync worker: every batch carries an idempotency key, a retry resends the same key, and waits are bounded.
2. **Security.** Secrets or `.env` values in code, logs or tests. Unvalidated input reaching SQL or the filter builder. New network calls. Changes to `.github/`, `.devcontainer/`, `.claude/` or dependency versions that the issue didn't ask for. If the PR changes a sensitive path, also go through "Sensitive paths" below.
3. **Acceptance criteria.** Go through the issue's criteria one by one and say for each whether the PR meets it, and where. Flag work the issue didn't ask for, and anything in its "Out of scope" section.

## Severity

- **Important:** must be fixed before merge. A bug a user or the sync can hit, a security problem, an unmet acceptance criterion, a broken AGENTS.md "Never" or "Ask first" rule, or a bug fix without a test that fails without it.
- **Nit:** would be better, but merging without it is fine. Naming, small duplication, a clearer test name.

Report every Important finding and at most 5 nits, the most useful first. If you can't tell whether something is a bug, say what you'd need to know; don't report it as Important. Nothing to report is a valid review.

## Always check

- A removed or renamed GraphQL field. Changes are additive.
- Hand edits to generated code (`apps/api/src/generated/`, `apps/web/src/gql/`) or to migrations (`packages/db/drizzle/`).
- An app or service importing from another app or service instead of `packages/*`.
- Deleted, skipped or weakened tests: `.skip`, `.only`, a loosened assertion.
- New behavior without a test next to the code.
- More than the issue needs: new abstractions, options, helpers or dependencies that its acceptance criteria don't call for.
- A change to commands, ports, setup steps or env vars without the matching update to AGENTS.md, README.md or `.env.example`.

## Sensitive paths

When the PR changes any of these paths, go through the checklist below and say in the summary which parts of it you checked. Every security problem you find here is Important.

- `services/sync-worker/**`
- `.github/**`, `.devcontainer/**`, `.claude/**`, `.githooks/**`
- `AGENTS.md`, `CLAUDE.md`, `REVIEW.md` at any depth, `.mcp.json`
- `package.json` at any depth, `pnpm-workspace.yaml`, `renovate.json`, `.coderabbit.yaml`, `docker-compose.yml`, `.env.example`

Checklist:

- **Secrets:** tokens, keys or `.env` values in code, logs, tests, or a workflow's `run:` lines and `echo`.
- **Workflows:**
  - permissions wider than the job needs
  - a job that holds a write token or a secret and also runs the PR's code or Claude
  - `${{ }}` with text someone else wrote put straight into `run:` instead of passed through `env:`
  - a `pull_request_target` or `workflow_run` job that checks out the PR's code and runs it
  - an action not pinned to a commit SHA, or `persist-credentials` left on
  - `allowed_bots: '*'` or `allowed_non_write_users`
- **Path filters** that decide what an agent may change or read, such as `publish`'s `protected` pattern: test them against paths git prints in quotes, nested folders, renames and symlinks.
- **Claude's isolation:** more allowed tools, fewer `--disallowedTools`, a review that doesn't run in `dontAsk`, changes to the step that removes the PR's rules files and symlinks or to the filter that keeps only text by people with write access, `--add-dir pr-head`.
- **Agent config** (AGENTS.md, CLAUDE.md, REVIEW.md, `.claude/`, `.githooks/`, `.mcp.json`): new allow rules, hooks that make network calls, new MCP servers, a weaker "Never" or "Ask first" rule.
- **Dev container:** a wider firewall allowlist, new mounts or capabilities, managed settings removed.
- **Dependencies** (`package.json`, `pnpm-workspace.yaml`, `renovate.json`): packages or version jumps the issue didn't ask for, install scripts, a lower `minimumReleaseAge`, git or URL sources.
- **Sync worker:** a destination URL or credentials taken from input, new outbound hosts, customer data in logs or errors, unbounded retries or waits.
- **Config:** `docker-compose.yml` ports open on `0.0.0.0` or default passwords exposed, real-looking values in `.env.example`, `.coderabbit.yaml` no longer listing REVIEW.md.

## Skip

- Formatting, import order and anything else Oxlint, Oxfmt or the typecheck already enforce. CI has passed when you review.
- Generated code, migrations and `pnpm-lock.yaml`, beyond the checks above.
- Style preferences that AGENTS.md doesn't state.
- Code the PR didn't touch, unless the change breaks it.
- Praise, and restating what the diff does.
