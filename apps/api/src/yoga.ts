import { typeDefs } from '@agents-review/shared/schema';
import { createSchema, createYoga } from 'graphql-yoga';

import type { Resolvers } from './generated/graphql.ts';

const resolvers: Resolvers = {
  Query: {
    hello: () => 'Hello from the API',
  },
};

export const yoga = createYoga({
  schema: createSchema({ typeDefs, resolvers }),
});
