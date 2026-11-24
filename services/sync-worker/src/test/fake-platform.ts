import { once } from 'node:events';
import { createServer } from 'node:http';

import { IDEMPOTENCY_CONFLICT_STATUS } from '@agents-review/shared/ad-platform';

/**
 * What the fake ad platform does with one request. "fail-after" stores the batch and then
 * answers 500; "drop" closes the connection; "hang" never answers.
 */
export type Step =
  | 'ok'
  | 'fail-before'
  | 'fail-after'
  | 'drop'
  | 'hang'
  | { status: number; retryAfter?: string; error?: string };

export interface FakeRequest {
  audienceId: string;
  key: string;
  memberIds: string[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function memberIdsOf(body: unknown): string[] {
  if (!isRecord(body) || !Array.isArray(body.members)) return [];
  const members: unknown[] = body.members;
  return members.map((member) => (isRecord(member) ? String(member.id) : ''));
}

/**
 * A stand-in for the ad platform: answers requests from a script (then "ok"), stores members
 * once per id, replays a known idempotency key without storing again, and answers 422 when a
 * known key comes with a different batch.
 */
export async function startFakePlatform(script: Step[] = []) {
  const requests: FakeRequest[] = [];
  const stored = new Map<string, Set<string>>();
  const knownKeys = new Map<string, string>();
  const hooks: { onRequest?: (request: FakeRequest) => void } = {};

  /** Stores the batch once per key; false when the key was used with a different batch. */
  const store = (request: FakeRequest): boolean => {
    const batch = JSON.stringify([request.audienceId, request.memberIds]);
    const known = knownKeys.get(request.key);
    if (known !== undefined) return known === batch;
    knownKeys.set(request.key, batch);
    const members = stored.get(request.audienceId) ?? new Set<string>();
    stored.set(request.audienceId, members);
    for (const id of request.memberIds) members.add(id);
    return true;
  };

  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      const audienceId = /^\/audiences\/([^/]+)\/members$/.exec(req.url ?? '')?.[1] ?? '';
      const key = String(req.headers['idempotency-key'] ?? '');
      const body: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      const request = { audienceId, key, memberIds: memberIdsOf(body) };
      requests.push(request);
      hooks.onRequest?.(request);

      const step = script.shift() ?? 'ok';
      if (step === 'hang') return;
      if (step === 'drop') {
        req.socket.destroy();
        return;
      }
      if ((step === 'ok' || step === 'fail-after') && !store(request)) {
        res.writeHead(IDEMPOTENCY_CONFLICT_STATUS, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'Key already used with a different batch.' }));
        return;
      }
      const status = typeof step === 'object' ? step.status : step === 'ok' ? 200 : 500;
      const headers: Record<string, string> = { 'content-type': 'application/json' };
      if (typeof step === 'object' && step.retryAfter !== undefined) {
        headers['retry-after'] = step.retryAfter;
      }
      res.writeHead(status, headers);
      res.end(
        JSON.stringify(
          status === 200
            ? { accepted: request.memberIds.length }
            : { error: typeof step === 'object' ? (step.error ?? 'Refused.') : 'Internal error.' },
        ),
      );
    });
  });

  // once() rejects on 'error', so a failed listen fails the test instead of hanging it.
  server.listen(0);
  await once(server, 'listening');
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('Expected a TCP address');

  return {
    url: new URL(`http://localhost:${address.port}`),
    requests,
    hooks,
    /** Stored member ids of an audience, sorted as numbers. */
    stored: (audienceId: string) =>
      [...(stored.get(audienceId) ?? [])].toSorted((a, b) => Number(a) - Number(b)),
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

export type FakePlatform = Awaited<ReturnType<typeof startFakePlatform>>;
