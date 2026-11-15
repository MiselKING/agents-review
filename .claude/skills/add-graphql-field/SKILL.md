---
name: add-graphql-field
description: Add a field, argument, type, query or mutation to the GraphQL API and use it in the web app. Gives the order of steps across the schema, codegen, resolvers, tests and web queries. Use for any change to packages/shared/schema.graphql.
---

# Add a GraphQL field

The schema is the contract. Change it first, generate types from it, then write code against them.

## Before you start

- Changes are additive: new fields, types, arguments with defaults, optional input fields.
- Removing or renaming a field, changing its type, or making an argument required breaks clients. Stop and ask before doing it.
- Never edit `apps/api/src/generated/` or `apps/web/src/gql/` by hand. Codegen writes them.

## Steps

1. **Schema.** Edit `packages/shared/schema.graphql`. Add a one-line description string to a field when its name doesn't say everything, such as limits, ordering, or when it's null.
2. **Codegen.** Run `pnpm codegen`. It updates the resolver types in `apps/api/src/generated/graphql.ts`.
3. **Mapper, for a new object type only.** If its resolvers return a database row instead of the GraphQL shape, add the row type to `mappers` in `codegen.ts`, like `Audience: '@agents-review/db/audiences#AudienceRow'`. If the row type lives in a new file in `packages/db/src/`, add that file to `exports` in `packages/db/package.json` first. Then run `pnpm codegen` again.
4. **Database access.** SQL goes in a function in `packages/db/src/`, not in the resolver.
5. **Resolver.** Add it in `apps/api/src/resolvers.ts`, typed by `Resolvers`, so a missing or wrong resolver fails `pnpm typecheck`. Follow the existing helpers there:
   - IDs: `parseId`; an unknown ID returns `null` for a query and throws `notFound` for a mutation.
   - Pages: `parsePage(first, after)` and a `{ nodes, pageInfo }` connection.
   - Bad input: `badInput([...])`, code `BAD_USER_INPUT`. Other errors: `GraphQLError` with a code in `extensions`.
   - Fields that differ from the row: a field resolver on the type, like `id: (row) => String(row.id)`.
6. **API test.** Test through GraphQL in a database test: `apps/api/src/*.db.test.ts` with `graphqlClient` and `inRollback`. Cover the happy path, null or not found, and each validation error. See the `write-tests` skill.
7. **Web query, if the web app uses it.** Add the operation with `graphql(...)` from `../gql`, named (`query AudienceMembers`), next to the hooks that use it, such as `apps/web/src/audiences/api.ts`. Run it through `execute` from `apps/web/src/graphql/execute.ts` inside a TanStack Query hook. Then run `pnpm codegen` again: it generates the operation's types in `apps/web/src/gql/`.
8. **Web test.** In component tests, answer the new operation by its name with `mockGraphql`.
9. **Check.** Run `pnpm codegen:check`, `pnpm lint && pnpm typecheck`, `pnpm test`, and `pnpm test:db` for the API test.

Commit the schema, the generated files and the code together. CI fails if the generated code is stale.
