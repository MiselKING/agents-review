import { afterEach, describe, expect, it } from 'vitest';

import { createDestination, maskEmails, parseRetryAfter } from './destination.ts';
import { type FakePlatform, type Step, startFakePlatform } from './test/fake-platform.ts';

const platforms: FakePlatform[] = [];
afterEach(async () => {
  await Promise.all(platforms.splice(0).map((platform) => platform.close()));
});

async function sendOnce(step: Step) {
  const platform = await startFakePlatform([step]);
  platforms.push(platform);
  const destination = createDestination(platform.url, { timeoutMs: 200 });
  const outcome = await destination.send('7', 'key-1', [{ id: '1', email: 'ann@example.com' }]);
  return { outcome, platform };
}

describe('createDestination', () => {
  it('posts the batch with its idempotency key', async () => {
    const { outcome, platform } = await sendOnce('ok');
    expect(outcome).toEqual({ kind: 'sent' });
    expect(platform.requests).toEqual([{ audienceId: '7', key: 'key-1', memberIds: ['1'] }]);
  });

  it('reports a rate limit with the seconds to wait', async () => {
    const { outcome } = await sendOnce({ status: 429, retryAfter: '7' });
    expect(outcome).toEqual({ kind: 'rate_limited', retryAfterSeconds: 7 });
  });

  it.each([
    ['a server error', 'fail-before' as const, 'HTTP 500: Internal error.'],
    ['a request timeout', { status: 408, error: 'Too slow.' }, 'HTTP 408: Too slow.'],
  ])('reports %s as worth retrying', async (_label, step, error) => {
    expect((await sendOnce(step)).outcome).toEqual({ kind: 'retryable', error });
  });

  it('reports no answer in time as worth retrying', async () => {
    const { outcome } = await sendOnce('hang');
    expect(outcome).toEqual({ kind: 'retryable', error: 'No answer within 200 ms.' });
  });

  it('reports a dropped connection as worth retrying', async () => {
    const { outcome } = await sendOnce('drop');
    expect(outcome.kind).toBe('retryable');
    expect(outcome.kind === 'retryable' ? outcome.error : '').toMatch(/^Network error/);
  });

  it('reports an unreachable platform as worth retrying', async () => {
    const destination = createDestination(new URL('http://localhost:1'), { timeoutMs: 200 });
    const outcome = await destination.send('7', 'key-1', [{ id: '1', email: 'a@example.com' }]);
    expect(outcome.kind).toBe('retryable');
  });

  it('reports any other refusal as rejected, with the message masked', async () => {
    const { outcome } = await sendOnce({ status: 400, error: 'Bad email ann@example.com.' });
    expect(outcome).toEqual({ kind: 'rejected', error: 'HTTP 400: Bad email [email]' });
  });
});

describe('parseRetryAfter', () => {
  const now = new Date('2026-11-15T12:00:00Z');

  it('reads seconds and HTTP dates', () => {
    expect(parseRetryAfter('5', now)).toBe(5);
    expect(parseRetryAfter('Sun, 15 Nov 2026 12:00:30 GMT', now)).toBe(30);
  });

  it('waits at least 1 and at most 3600 seconds', () => {
    expect(parseRetryAfter(null, now)).toBe(1);
    expect(parseRetryAfter('0', now)).toBe(1);
    expect(parseRetryAfter('soon', now)).toBe(1);
    expect(parseRetryAfter('999999', now)).toBe(3600);
  });
});

describe('maskEmails', () => {
  it('masks every email address', () => {
    expect(maskEmails('ann@example.com and bob.x+1@test.co failed')).toBe(
      '[email] and [email] failed',
    );
  });
});
