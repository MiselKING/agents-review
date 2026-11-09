import type { TypedDocumentString } from '../gql/graphql';

type GraphQLResponse<TResult> = {
  data?: TResult;
  errors?: { message: string }[];
};

/**
 * Checks the GraphQL response envelope (an object with `data` and/or an `errors` array).
 * The shape of `data` is trusted: it comes from our API, typed by the codegen contract.
 */
function isGraphQLResponse<TResult>(value: unknown): value is GraphQLResponse<TResult> {
  if (typeof value !== 'object' || value === null) return false;
  if ('errors' in value && !Array.isArray(value.errors)) return false;
  return 'data' in value || 'errors' in value;
}

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

  const body: unknown = await response.json();
  if (!isGraphQLResponse<TResult>(body)) {
    throw new Error('Unexpected response from the GraphQL API');
  }
  if (body.errors?.length) {
    throw new Error(body.errors.map((error) => error.message).join('\n'));
  }
  if (body.data === undefined) {
    throw new Error('GraphQL response had no data');
  }
  return body.data;
}
