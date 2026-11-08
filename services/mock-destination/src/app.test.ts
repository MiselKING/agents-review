import { afterAll, beforeAll, expect, it } from 'vitest';

import { createApp } from './app.ts';

const server = createApp();
let baseUrl = '';

beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('Expected a TCP address');
  baseUrl = `http://localhost:${address.port}`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

it('reports healthy on GET /health', async () => {
  const response = await fetch(`${baseUrl}/health`);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ status: 'ok' });
});

it('returns 404 for unknown paths', async () => {
  const response = await fetch(`${baseUrl}/nope`);
  expect(response.status).toBe(404);
});
