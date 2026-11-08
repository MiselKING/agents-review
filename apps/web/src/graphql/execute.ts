import type { TypedDocumentString } from '../gql/graphql';

type GraphQLResponse<TResult> = {
  data?: TResult;
  errors?: { message: string }[];
};

/**
 * Sends a typed GraphQL operation to the API through the Vite `/graphql` proxy.
 * Use it as the `queryFn` of a TanStack Query hook.
 */
export async function execute<TResult, TVariables>(
  query: TypedDocumentString<TResult, TVariables>,
  ...[variables]: TVariables extends Record<string, never> ? [] : [TVariables]
): Promise<TResult> {
  const response = await fetch('/graphql', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/graphql-response+json',
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new Error(`GraphQL request failed with status ${response.status}`);
  }

  const body: GraphQLResponse<TResult> = await response.json();
  if (body.errors?.length) {
    throw new Error(body.errors.map((error) => error.message).join('\n'));
  }
  if (body.data === undefined) {
    throw new Error('GraphQL response had no data');
  }
  return body.data;
}
