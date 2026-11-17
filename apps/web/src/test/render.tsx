import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { vi } from 'vitest';

type Handler = (variables: Record<string, unknown>) => unknown;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Returned by a handler to answer with GraphQL errors, like `{ message, code }`. */
export class MockGraphqlErrors {
  readonly errors: { message: string; extensions: { code?: string } }[];
  constructor(...errors: { message: string; code?: string }[]) {
    this.errors = errors.map(({ message, code }) => ({ message, extensions: { code } }));
  }
}

/**
 * Answers GraphQL requests by operation name, like `{ Countries: () => ({ countries: [] }) }`.
 * A handler may return a promise to delay its answer. Returns the requests made, for assertions.
 */
export function mockGraphql(handlers: Record<string, Handler>) {
  const requests: { operation: string; variables: Record<string, unknown> }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init?: RequestInit) => {
      const body: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
      const query = isRecord(body) && typeof body.query === 'string' ? body.query : '';
      const variables = isRecord(body) && isRecord(body.variables) ? body.variables : {};
      const operation = /(?:query|mutation)\s+(\w+)/.exec(query)?.[1] ?? '';
      requests.push({ operation, variables });
      const handler = handlers[operation];
      let payload: unknown = { errors: [{ message: `No mock for ${operation}` }] };
      if (handler) {
        const result = await handler(variables);
        payload =
          result instanceof MockGraphqlErrors ? { errors: result.errors } : { data: result };
      }
      return new Response(JSON.stringify(payload), {
        headers: { 'content-type': 'application/json' },
      });
    }),
  );
  return requests;
}

export function renderWithProviders(ui: ReactNode, initialEntry = '/') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const result = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...result, queryClient };
}
