import { createHash } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

import { type Member, parseBatch } from './batch.ts';
import { createRateLimiter } from './rate-limiter.ts';

export const MAX_BODY_BYTES = 1024 * 1024;
const MAX_KEY_LENGTH = 255;
const MEMBERS_PATH = /^\/audiences\/([\w-]{1,64})\/members$/;

export interface AppOptions {
  /** Share of POST requests that fail with a 500, from 0 to 1. */
  failureRate: number;
  /** Requests allowed per second across all callers; 0 means no limit. */
  rateLimitPerSecond: number;
  /** Numbers from 0 (inclusive) to 1 (exclusive). Tests pass a scripted sequence. */
  random?: () => number;
  /** Milliseconds since the epoch. Tests pass a fake clock. */
  now?: () => number;
  /** Receives one line per request. Never given email addresses. */
  log?: (line: string) => void;
}

interface Answer {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
  /** For the log line only. */
  accepted?: number;
}

interface RememberedRequest {
  fingerprint: string;
  answer: Answer;
}

class BodyTooLarge extends Error {}

function send(res: ServerResponse, { status, body, headers }: Answer) {
  res.writeHead(status, { 'content-type': 'application/json', ...headers });
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<string> {
  if (Number(req.headers['content-length'] ?? 0) > MAX_BODY_BYTES) throw new BodyTooLarge();
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    size += buffer.length;
    if (size > MAX_BODY_BYTES) throw new BodyTooLarge();
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

const fingerprintOf = (audienceId: string, members: Member[]) =>
  createHash('sha256')
    .update(JSON.stringify([audienceId, members]))
    .digest('hex');

/** The fake ad platform: stores audience members in memory and misbehaves on purpose. */
export function createApp(options: AppOptions) {
  const random = options.random ?? Math.random;
  const log = options.log ?? console.log;
  const takeRateLimit = createRateLimiter(options.rateLimitPerSecond, options.now ?? Date.now);
  const audiences = new Map<string, Map<string, string>>();
  const remembered = new Map<string, RememberedRequest>();

  // Draws once per request; half of the failures happen after the batch is stored.
  const drawFailure = (): 'none' | 'before' | 'after' => {
    if (random() >= options.failureRate) return 'none';
    return random() < 0.5 ? 'before' : 'after';
  };

  const serverError: Answer = {
    status: 500,
    body: { error: 'Internal error. Retry with the same Idempotency-Key.' },
  };

  async function receiveMembers(req: IncomingMessage, audienceId: string): Promise<Answer> {
    const retryAfter = takeRateLimit();
    if (retryAfter > 0) {
      // Drain the body so the connection can be reused.
      req.resume();
      return {
        status: 429,
        body: { error: `Rate limit exceeded. Retry after ${retryAfter} seconds.` },
        headers: { 'retry-after': String(retryAfter) },
      };
    }

    const key = req.headers['idempotency-key'];
    let text: string;
    try {
      text = await readBody(req);
    } catch (error) {
      if (error instanceof BodyTooLarge) {
        return { status: 413, body: { error: `Body must be at most ${MAX_BODY_BYTES} bytes.` } };
      }
      throw error;
    }
    if (typeof key !== 'string' || key.length === 0 || key.length > MAX_KEY_LENGTH) {
      return {
        status: 400,
        body: { error: `Idempotency-Key header is required, 1 to ${MAX_KEY_LENGTH} characters.` },
      };
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return { status: 400, body: { error: 'Body must be JSON.' } };
    }
    const batch = parseBatch(parsed);
    if (!batch.ok) return { status: 400, body: { error: batch.error } };

    const failure = drawFailure();
    if (failure === 'before') return serverError;

    const fingerprint = fingerprintOf(audienceId, batch.members);
    const known = remembered.get(key);
    if (known && known.fingerprint !== fingerprint) {
      return {
        status: 422,
        body: { error: 'This Idempotency-Key was already used with a different batch.' },
      };
    }

    let answer = known?.answer;
    if (!answer) {
      const stored = audiences.get(audienceId) ?? new Map<string, string>();
      audiences.set(audienceId, stored);
      for (const member of batch.members) stored.set(member.id, member.email);
      answer = {
        status: 200,
        body: { accepted: batch.members.length },
        accepted: batch.members.length,
      };
      remembered.set(key, { fingerprint, answer });
    }
    return failure === 'after' ? serverError : answer;
  }

  function listMembers(audienceId: string): Answer {
    const stored = audiences.get(audienceId) ?? new Map<string, string>();
    const members = [...stored].map(([id, email]) => ({ id, email }));
    return { status: 200, body: { audienceId, count: members.length, members } };
  }

  async function route(req: IncomingMessage, path: string): Promise<Answer> {
    if (req.method === 'GET' && path === '/health') return { status: 200, body: { status: 'ok' } };

    const audienceId = MEMBERS_PATH.exec(path)?.[1];
    if (audienceId === undefined) return { status: 404, body: { error: 'Not found.' } };
    if (req.method === 'POST') return receiveMembers(req, audienceId);
    if (req.method === 'GET') return listMembers(audienceId);
    return { status: 405, body: { error: 'Use GET or POST.' }, headers: { allow: 'GET, POST' } };
  }

  async function handle(req: IncomingMessage, res: ServerResponse) {
    // Only the path is logged: a query string could carry anything, emails included.
    const path = new URL(req.url ?? '/', 'http://localhost').pathname;
    let answer: Answer;
    try {
      answer = await route(req, path);
    } catch (error) {
      const reason = error instanceof Error ? error.name : 'error';
      log(`${req.method} ${path} failed unexpectedly: ${reason}`);
      answer = serverError;
    }
    const accepted = answer.accepted === undefined ? '' : ` accepted=${answer.accepted}`;
    log(`${req.method} ${path} ${answer.status}${accepted}`);
    send(res, answer);
  }

  return createServer((req, res) => {
    void handle(req, res);
  });
}
