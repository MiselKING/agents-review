import { createDb } from '@agents-review/db';
import { afterAll, expect, it } from 'vitest';

import { createApi } from './yoga.ts';

// The pool only connects on the first query, and `hello` makes none.
const { db, pool } = createDb('postgres://unused@localhost:1/unused');
afterAll(() => pool.end());

it('answers the hello query', async () => {
  const response = await createApi(db).fetch('http://localhost/graphql', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query: '{ hello }' }),
  });

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ data: { hello: 'Hello from the API' } });
});
