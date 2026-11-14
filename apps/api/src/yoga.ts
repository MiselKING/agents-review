import type { Queryable } from '@agents-review/db';
import { typeDefs } from '@agents-review/shared/schema';
import { createSchema, createYoga } from 'graphql-yoga';

import type { ApiContext } from './context.ts';
import { resolvers } from './resolvers.ts';

const schema = createSchema<ApiContext>({ typeDefs, resolvers });

/** The GraphQL server. Errors other than GraphQLError reach clients as "Unexpected error." */
export function createApi(db: Queryable) {
  return createYoga({ schema, context: () => ({ db, now: new Date() }) });
}
