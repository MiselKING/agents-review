import type { Server } from 'node:http';

import { afterEach, describe, expect, it } from 'vitest';

import { type AppOptions, createApp, MAX_BODY_BYTES } from './app.ts';

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))),
  );
});

/** Starts an app on a free port. Reliable by default: no failures, no rate limit. */
async function start(options: Partial<AppOptions> = {}) {
  const lines: string[] = [];
  const server = createApp({
    failureRate: 0,
    rateLimitPerSecond: 0,
    log: (line) => lines.push(line),
    ...options,
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('Expected a TCP address');
  const baseUrl = `http://localhost:${address.port}`;

  const send = (audienceId: string, body: unknown, key: string | null = 'key-1') =>
    fetch(`${baseUrl}/audiences/${audienceId}/members`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(key === null ? {} : { 'idempotency-key': key }),
      },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    });

  const stored = async (audienceId: string): Promise<unknown> =>
    (await fetch(`${baseUrl}/audiences/${audienceId}/members`)).json();

  const storedCount = async (audienceId: string) => {
    const body = await stored(audienceId);
    return typeof body === 'object' && body !== null && 'count' in body ? body.count : undefined;
  };

  return { baseUrl, send, stored, storedCount, lines };
}

/** A random source that returns these values in order, then fails the test if asked for more. */
function scripted(...values: number[]) {
  return () => {
    const value = values.shift();
    if (value === undefined) throw new Error('The scripted random source ran out of values.');
    return value;
  };
}

const members = (...ids: number[]) => ({
  members: ids.map((id) => ({ id: String(id), email: `customer${id}@example.com` })),
});

// With failureRate 0.5: 0.1 fails, then 0.2 fails before storing, 0.8 after storing; 0.9 succeeds.
const FAIL_BEFORE = [0.1, 0.2];
const FAIL_AFTER = [0.1, 0.8];
const SUCCEED = [0.9];

describe('POST /audiences/:id/members', () => {
  it('stores a valid batch and answers with how many were accepted', async () => {
    const app = await start();
    const response = await app.send('7', members(1, 2, 3));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ accepted: 3 });
    expect(await app.stored('7')).toEqual({
      audienceId: '7',
      count: 3,
      members: members(1, 2, 3).members,
    });
  });

  it('has no members for an audience nothing was sent to', async () => {
    const app = await start();
    expect(await app.stored('99')).toEqual({ audienceId: '99', count: 0, members: [] });
  });

  it('does not store a member twice', async () => {
    const app = await start();
    await app.send('7', members(1, 2), 'key-1');
    await app.send('7', members(2, 3), 'key-2');
    expect(await app.storedCount('7')).toBe(3);
  });

  it('replays the first answer for a repeated key and batch, storing nothing twice', async () => {
    const app = await start();
    const first = await app.send('7', members(1, 2), 'key-1');
    const repeat = await app.send('7', members(1, 2), 'key-1');
    expect(repeat.status).toBe(200);
    expect(await repeat.json()).toEqual(await first.json());
    expect(await app.storedCount('7')).toBe(2);
  });

  it('rejects a key reused with a different batch or audience, changing nothing', async () => {
    const app = await start();
    await app.send('7', members(1), 'key-1');
    for (const [audienceId, body] of [
      ['7', members(2)],
      ['8', members(1)],
    ] as const) {
      // oxlint-disable-next-line no-await-in-loop
      const response = await app.send(audienceId, body, 'key-1');
      expect(response.status).toBe(422);
    }
    expect(await app.storedCount('7')).toBe(1);
    expect(await app.storedCount('8')).toBe(0);
  });

  it('rejects a request without an idempotency key', async () => {
    const app = await start();
    const response = await app.send('7', members(1), null);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: 'Idempotency-Key header is required, 1 to 255 characters.',
    });
  });

  it.each([
    ['a body that is not JSON', '{nope', 'Body must be JSON.'],
    ['no members list', { people: [] }, 'Body must be an object with a members list.'],
    ['no members', { members: [] }, 'members must have 1 to 500 entries, got 0.'],
    [
      'more than 500 members',
      members(...Array.from({ length: 501 }, (_, index) => index)),
      'members must have 1 to 500 entries, got 501.',
    ],
    [
      'a member without an id',
      { members: [{ email: 'a@example.com' }] },
      'members[0].id must be a string of 1 to 64 characters.',
    ],
    [
      'a member without an email',
      { members: [{ id: '1' }, { id: '2' }] },
      'members[0].email must be an email address.',
    ],
    [
      'a member with an invalid email',
      { members: [{ id: '1', email: 'not-an-email' }] },
      'members[0].email must be an email address.',
    ],
  ])('rejects %s and stores nothing', async (_label, body, error) => {
    const app = await start();
    const response = await app.send('7', body);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error });
    expect(await app.storedCount('7')).toBe(0);
  });

  it('rejects a body larger than 1 MB', async () => {
    const app = await start();
    const response = await app.send('7', 'x'.repeat(MAX_BODY_BYTES + 1));
    expect(response.status).toBe(413);
    expect(await app.storedCount('7')).toBe(0);
  });

  it('accepts exactly 500 members', async () => {
    const app = await start();
    const response = await app.send('7', members(...Array.from({ length: 500 }, (_, i) => i)));
    expect(await response.json()).toEqual({ accepted: 500 });
  });
});

describe('rate limit', () => {
  it('refuses requests above the limit with the seconds to wait, then accepts again', async () => {
    let now = 1_000_000;
    const app = await start({ rateLimitPerSecond: 2, now: () => now });

    expect((await app.send('7', members(1), 'a')).status).toBe(200);
    expect((await app.send('7', members(2), 'b')).status).toBe(200);
    const refused = await app.send('7', members(3), 'c');
    expect(refused.status).toBe(429);
    expect(refused.headers.get('retry-after')).toBe('1');
    expect(await app.storedCount('7')).toBe(2);

    now += 1000;
    expect((await app.send('7', members(3), 'c')).status).toBe(200);
    expect(await app.storedCount('7')).toBe(3);
  });

  it('counts repeats too', async () => {
    const app = await start({ rateLimitPerSecond: 1, now: () => 0 });
    expect((await app.send('7', members(1), 'a')).status).toBe(200);
    expect((await app.send('7', members(1), 'a')).status).toBe(429);
  });
});

describe('random failures', () => {
  it('fails the configured share of requests', async () => {
    // A failure rate of 0.25 fails exactly the draws below 0.25.
    const app = await start({ failureRate: 0.25, random: scripted(0.1, 0.2, 0.3, 0.6, 0.9) });
    const statuses: number[] = [];
    for (const key of ['a', 'b', 'c', 'd']) {
      // oxlint-disable-next-line no-await-in-loop
      statuses.push((await app.send('7', members(1), key)).status);
    }
    expect(statuses).toEqual([500, 200, 200, 200]);
  });

  it('after a failure before storing, a retry with the same key stores the batch once', async () => {
    const app = await start({ failureRate: 0.5, random: scripted(...FAIL_BEFORE, ...SUCCEED) });
    expect((await app.send('7', members(1, 2), 'key-1')).status).toBe(500);
    expect(await app.storedCount('7')).toBe(0);

    const retry = await app.send('7', members(1, 2), 'key-1');
    expect(await retry.json()).toEqual({ accepted: 2 });
    expect(await app.storedCount('7')).toBe(2);
  });

  it('after a failure after storing, a retry with the same key replays without storing twice', async () => {
    const app = await start({ failureRate: 0.5, random: scripted(...FAIL_AFTER, ...SUCCEED) });
    expect((await app.send('7', members(1, 2), 'key-1')).status).toBe(500);
    expect(await app.storedCount('7')).toBe(2);

    const retry = await app.send('7', members(1, 2), 'key-1');
    expect(await retry.json()).toEqual({ accepted: 2 });
    expect(await app.storedCount('7')).toBe(2);
  });

  it('never fails with a failure rate of 0 and no rate limit', async () => {
    const app = await start();
    const responses = await Promise.all(
      Array.from({ length: 200 }, (_, index) => app.send('7', members(index), `key-${index}`)),
    );
    expect(responses.every((response) => response.status === 200)).toBe(true);
    expect(await app.storedCount('7')).toBe(200);
  });
});

describe('other routes and logging', () => {
  it('reports healthy on GET /health', async () => {
    const app = await start();
    const response = await fetch(`${app.baseUrl}/health`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
  });

  it('answers 404 for unknown paths and 405 for other methods', async () => {
    const app = await start();
    expect((await fetch(`${app.baseUrl}/nope`)).status).toBe(404);
    const deleted = await fetch(`${app.baseUrl}/audiences/7/members`, { method: 'DELETE' });
    expect(deleted.status).toBe(405);
    expect(deleted.headers.get('allow')).toBe('GET, POST');
  });

  it('never logs email addresses, even from the query string', async () => {
    const app = await start({ failureRate: 0.5, random: scripted(...FAIL_AFTER, ...SUCCEED) });
    await app.send('7', members(1, 2), 'key-1');
    await app.send('7', members(1, 2), 'key-1');
    await app.send('7', { members: [{ id: '1', email: 'bad' }] }, 'key-2');
    await fetch(`${app.baseUrl}/audiences/7/members?email=leak@example.com`);
    expect(app.lines.length).toBeGreaterThan(0);
    expect(app.lines.join('\n')).not.toContain('@');
  });
});
