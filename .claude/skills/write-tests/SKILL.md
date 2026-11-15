---
name: write-tests
description: Write or change tests in this repo. Picks the kind of test (unit, database or e2e), names an existing test to copy, and gives the command that runs one file of that kind. Use when adding or fixing tests for any package.
---

# Write tests

## Pick the kind

Test at the lowest level that shows the behavior.

| Kind | Use it for | File | Copy from |
|---|---|---|---|
| Unit | Pure logic, React components, HTTP handlers with fakes | `src/**/foo.test.ts` (web: `.test.tsx` too) | `packages/shared/src/audience-filter.test.ts`, `apps/web/src/audiences/AudienceListPage.test.tsx` |
| Database | SQL, resolvers that query, the sync worker's run processing | `src/**/foo.db.test.ts`, only in `apps/api`, `packages/db`, `services/sync-worker` | `apps/api/src/sync-runs.db.test.ts` |
| E2E | A user flow across the web app and the API | `apps/web/e2e/*.spec.ts` | `apps/web/e2e/audiences.spec.ts` |

A test file sits next to the file it tests: `foo.ts` → `foo.test.ts` or `foo.db.test.ts`.

## Run one file

Paths are relative to the package directory.

| Kind | Command |
|---|---|
| Unit | `pnpm --filter ./<package-dir> exec vitest run src/foo.test.ts` |
| Database | `pnpm --filter ./<package-dir> exec vitest run --config vitest.db.config.ts src/foo.db.test.ts` |
| E2E | `pnpm --filter ./apps/web exec playwright test e2e/foo.spec.ts` |

Without `--config vitest.db.config.ts`, a database test file is excluded and Vitest exits with "No test files found".

Database and e2e tests need Postgres up and migrated (`docker compose up -d && pnpm db:migrate`). Playwright starts the API and the web app itself. If Chromium is missing, run `pnpm test:e2e` once; it installs it. In GitHub Actions agent runs there is no Postgres or browser: run unit tests only and leave the rest to CI.

## Unit tests

- No database: a unit test never connects. `apps/api/src/yoga.test.ts` creates a client with an unused URL for a query that makes no SQL.
- Web components: render with `renderWithProviders` and answer GraphQL by operation name with `mockGraphql`, both from `apps/web/src/test/render.tsx`. `mockGraphql` stubs `fetch`, so call `vi.unstubAllGlobals()` in `afterEach`. Query by role and visible text.
- Sync worker HTTP: use the fake ad platform in `services/sync-worker/src/test/fake-platform.ts`, not the mock-destination service.

## Database tests

All database tests share one database, with seed data in it, and files run one at a time.

- Leave no rows behind. Prefer `inRollback` from `@agents-review/db/rollback`: it runs the test in a transaction that is always rolled back. In the API, pass the transaction to `createApi(tx)` and query it with `graphqlClient` from `apps/api/src/test/graphql.ts`, as `withApi` in `apps/api/src/sync-runs.db.test.ts` does.
- When the test needs committed rows, such as code that takes the pool rather than a transaction, record the ids you create and delete them in `afterEach` or `afterAll`, as `services/sync-worker/src/process-run.db.test.ts` does.
- Don't assume exact row counts in shared tables; seed data is there. Create your own rows with names or values no seed row has, and assert on those.
- End the pool in `afterAll(() => pool.end())`.
- Use `at(body, 'data', ...)` from `apps/api/src/test/graphql.ts` to read GraphQL responses without casts.

## E2E tests

- Create test data through the GraphQL API with `request.post('/graphql', ...)`, with unique names, and archive it in `test.afterEach`, as `apps/web/e2e/audiences.spec.ts` does.
- Find elements by role and accessible name. No CSS selectors, no fixed waits.

## Rules

- A bug fix needs a test that fails without the fix and passes with it. Run it before the fix to see it fail.
- Never delete, skip or weaken a failing test: no `.skip`, `.only`, `.todo` or loosened assertions. Fix the code, or ask if the test itself is wrong.
- Test behavior, not implementation: assert on outputs, rows and what the user sees, not on private functions or call counts.
- Before you finish, run `pnpm test`, and `pnpm test:db` if you touched a database test or the code one covers.
