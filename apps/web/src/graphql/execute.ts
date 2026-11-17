import type { TypedDocumentString } from '../gql/graphql';

type GraphQLResponse<TResult> = {
  data?: TResult;
  errors?: { message: string; extensions?: { code?: unknown } }[];
};

/** A GraphQL `errors` response; `codes` are the `extensions.code` values the API sent. */
export class GraphQLRequestError extends Error {
  readonly codes: string[];

  constructor(message: string, codes: string[]) {
    super(message);
    this.name = 'GraphQLRequestError';
    this.codes = codes;
  }
}

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
    const codes = body.errors.flatMap((error) =>
      typeof error.extensions?.code === 'string' ? [error.extensions.code] : [],
    );
    throw new GraphQLRequestError(body.errors.map((error) => error.message).join('\n'), codes);
  }
  if (body.data === undefined) {
    throw new Error('GraphQL response had no data');
  }
  return body.data;
}
