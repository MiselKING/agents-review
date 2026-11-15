import type { createApi } from '../yoga.ts';

export interface GqlResponse {
  data?: unknown;
  errors?: { message: string; extensions?: { code?: unknown } }[];
}

const isGqlResponse = (value: unknown): value is GqlResponse =>
  typeof value === 'object' && value !== null && ('data' in value || 'errors' in value);

/** Sends GraphQL requests straight to the API, without a network. */
export function graphqlClient(api: ReturnType<typeof createApi>) {
  return async (query: string, variables: Record<string, unknown> = {}): Promise<GqlResponse> => {
    const response = await api.fetch('http://localhost/graphql', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query, variables }),
    });
    const body: unknown = await response.json();
    if (!isGqlResponse(body)) throw new Error(`Not a GraphQL response: ${JSON.stringify(body)}`);
    return body;
  };
}

/** Reads a nested value, like at(body, 'data', 'audience', 'id'). */
export function at(value: unknown, ...path: (string | number)[]): unknown {
  let current = value;
  for (const key of path) {
    if (typeof current !== 'object' || current === null) return undefined;
    const next: unknown = Reflect.get(current, key);
    current = next;
  }
  return current;
}
