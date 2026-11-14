import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { vi } from 'vitest';

type Handler = (variables: Record<string, unknown>) => unknown;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Answers GraphQL requests by operation name, like `{ Countries: () => ({ countries: [] }) }`.
 * Returns the requests made, for assertions.
 */
export function mockGraphql(handlers: Record<string, Handler>) {
  const requests: { operation: string; variables: Record<string, unknown> }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((_url: string, init?: RequestInit) => {
      const body: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
      const query = isRecord(body) && typeof body.query === 'string' ? body.query : '';
      const variables = isRecord(body) && isRecord(body.variables) ? body.variables : {};
      const operation = /(?:query|mutation)\s+(\w+)/.exec(query)?.[1] ?? '';
      requests.push({ operation, variables });
      const handler = handlers[operation];
      const payload = handler
        ? { data: handler(variables) }
        : { errors: [{ message: `No mock for ${operation}` }] };
      return Promise.resolve(
        new Response(JSON.stringify(payload), { headers: { 'content-type': 'application/json' } }),
      );
    }),
  );
  return requests;
}

export function renderWithProviders(ui: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}
