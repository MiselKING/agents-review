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
      },
    },
  },
};

export default config;
