import type { CodegenConfig } from '@graphql-codegen/cli';

// Run `pnpm codegen` after changing packages/shared/schema.graphql or a query in apps/web.
// `pnpm codegen:check` fails if the committed output is stale.
const config: CodegenConfig = {
  schema: 'packages/shared/schema.graphql',
  generates: {
    // Server: resolver types for the API.
    'apps/api/src/generated/graphql.ts': {
      plugins: ['typescript', 'typescript-resolvers'],
      config: {
        useTypeImports: true,
        enumsAsTypes: true,
        contextType: '../context.ts#ApiContext',
        scalars: { DateTime: { input: 'Date', output: 'Date' } },
        // Resolvers return database rows; field resolvers turn them into the GraphQL shape.
        mappers: {
          Audience: '@agents-review/db/audiences#AudienceRow',
          AudiencePreview: '../context.ts#PreviewParent',
          Member: '@agents-review/db/audience-members#MemberRow',
          SyncRun: '@agents-review/db/sync-runs#SyncRunRow',
        },
      },
    },
    // Client: typed documents for the web app's `graphql()` calls.
    'apps/web/src/gql/': {
      preset: 'client',
      documents: ['apps/web/src/**/*.{ts,tsx}', '!apps/web/src/gql/**'],
      config: {
        documentMode: 'string',
        useTypeImports: true,
        enumsAsTypes: true,
        scalars: { DateTime: 'string' },
      },
    },
  },
};

export default config;
