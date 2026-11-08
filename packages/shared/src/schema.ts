import { readFileSync } from 'node:fs';

/** The GraphQL schema (SDL) from packages/shared/schema.graphql. Server-side only. */
export const typeDefs = readFileSync(new URL('../schema.graphql', import.meta.url), 'utf8');
