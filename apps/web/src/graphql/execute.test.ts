import { afterEach, describe, expect, it, vi } from 'vitest';

import { TypedDocumentString } from '../gql/graphql';
import { execute, GraphQLRequestError } from './execute';

const query = new TypedDocumentString<unknown, Record<string, never>>('query X { x }');

function answer(body: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(body))),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('execute', () => {
  it('exposes the error codes of a GraphQL error', async () => {
    answer({ errors: [{ message: 'Busy', extensions: { code: 'SYNC_IN_PROGRESS' } }] });
    const error = await execute(query).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(GraphQLRequestError);
    expect(error).toMatchObject({ message: 'Busy', codes: ['SYNC_IN_PROGRESS'] });
  });

  it('has no codes when the error carries none', async () => {
    answer({ errors: [{ message: 'Broken' }] });
    const error = await execute(query).catch((caught: unknown) => caught);
    expect(error).toMatchObject({ message: 'Broken', codes: [] });
  });
});
