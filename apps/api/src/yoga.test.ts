import { expect, it } from 'vitest';
import { yoga } from './yoga.ts';

it('answers the hello query', async () => {
  const response = await yoga.fetch('http://localhost/graphql', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query: '{ hello }' }),
  });

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ data: { hello: 'Hello from the API' } });
});
