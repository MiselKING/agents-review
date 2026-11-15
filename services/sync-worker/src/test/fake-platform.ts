import { createServer } from 'node:http';

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
 * once per id, and replays a known idempotency key without storing again.
 */
export async function startFakePlatform(script: Step[] = []) {
  const requests: FakeRequest[] = [];
  const stored = new Map<string, Set<string>>();
  const knownKeys = new Set<string>();
  const hooks: { onRequest?: (request: FakeRequest) => void } = {};

  const store = (request: FakeRequest) => {
    if (knownKeys.has(request.key)) return;
    knownKeys.add(request.key);
    const members = stored.get(request.audienceId) ?? new Set<string>();
    stored.set(request.audienceId, members);
    for (const id of request.memberIds) members.add(id);
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
      if (step === 'ok' || step === 'fail-after') store(request);
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

  await new Promise<void>((resolve) => server.listen(0, resolve));
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
