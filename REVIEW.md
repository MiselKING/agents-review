# Review instructions

How to review a pull request in this repo. For Claude, CodeRabbit and Copilot review. AGENTS.md holds the project rules; this file says what to check and how serious it is.

## Three passes

Read the PR description and the issue it closes first, then make three passes over the diff.

1. **Bugs.** Wrong logic, unhandled errors, races, off-by-one, broken edge cases (empty audience, zero members, a retry after a partial failure). In the sync worker: every batch carries an idempotency key, a retry resends the same key, and waits are bounded.
2. **Security.** Secrets or `.env` values in code, logs or tests. Unvalidated input reaching SQL or the filter builder. New network calls. Changes to `.github/`, `.devcontainer/`, `.claude/` or dependency versions that the issue didn't ask for.
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

## Skip

- Formatting, import order and anything else Oxlint, Oxfmt or the typecheck already enforce. CI has passed when you review.
- Generated code, migrations and `pnpm-lock.yaml`, beyond the checks above.
- Style preferences that AGENTS.md doesn't state.
- Code the PR didn't touch, unless the change breaks it.
- Praise, and restating what the diff does.
