import {
  IDEMPOTENCY_CONFLICT_STATUS,
  IDEMPOTENCY_KEY_HEADER,
  type PlatformMember,
} from '@agents-review/shared/ad-platform';

export type DestinationMember = PlatformMember;

export type SendOutcome =
  | { kind: 'sent' }
  | { kind: 'rate_limited'; retryAfterSeconds: number }
  /** Worth retrying with the same key: a server error, a timeout or a network error. */
  | { kind: 'retryable'; error: string }
  /** The key was used before with a different batch, so an earlier attempt reached the platform. */
  | { kind: 'key_reused'; error: string }
  /** Retrying can't help: the platform refused the request itself. */
  | { kind: 'rejected'; error: string };

export interface Destination {
  send(
    audienceId: string,
    idempotencyKey: string,
    members: DestinationMember[],
  ): Promise<SendOutcome>;
}

export const MAX_ERROR_LENGTH = 200;

/** Error text goes to logs and the database, so any email address in it is masked. */
export const maskEmails = (text: string) => text.replaceAll(/[^\s@]+@[^\s@]+/g, '[email]');

const errorText = (text: string) => maskEmails(text).slice(0, MAX_ERROR_LENGTH);

/**
 * Seconds from a Retry-After header: a number of seconds or an HTTP date. At least 1; the
 * worker's policy decides whether a long wait is worth it.
 */
export function parseRetryAfter(header: string | null, now: Date): number {
  if (header === null) return 1;
  const seconds = /^\d+$/.test(header.trim())
    ? Number(header)
    : Math.ceil((Date.parse(header) - now.getTime()) / 1000);
  if (!Number.isFinite(seconds)) return 1;
  return Math.max(seconds, 1);
}

async function describe(response: Response): Promise<string> {
  const text = await response.text().catch(() => '');
  let message = text;
  try {
    const body: unknown = JSON.parse(text);
    if (
      typeof body === 'object' &&
      body !== null &&
      'error' in body &&
      typeof body.error === 'string'
    ) {
      message = body.error;
    }
  } catch {
    // Not JSON: keep the raw text.
  }
  return errorText(`HTTP ${response.status}${message ? `: ${message}` : ''}`);
}

/** Sends member batches to the ad platform's `POST /audiences/:id/members`. */
export function createDestination(
  baseUrl: URL,
  { timeoutMs, now = () => new Date() }: { timeoutMs: number; now?: () => Date },
): Destination {
  const base = baseUrl.href.endsWith('/') ? baseUrl.href : `${baseUrl.href}/`;
  return {
    async send(audienceId, idempotencyKey, members) {
      const url = new URL(`audiences/${encodeURIComponent(audienceId)}/members`, base);
      let response: Response;
      try {
        response = await fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json', [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
          body: JSON.stringify({ members }),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (error) {
        const timedOut = error instanceof Error && error.name === 'TimeoutError';
        const reason =
          error instanceof Error
            ? error.cause instanceof Error
              ? error.cause.message
              : error.message
            : 'unknown';
        return {
          kind: 'retryable',
          error: errorText(
            timedOut ? `No answer within ${timeoutMs} ms.` : `Network error: ${reason}`,
          ),
        };
      }

      if (response.ok) {
        await response.body?.cancel();
        return { kind: 'sent' };
      }
      if (response.status === 429) {
        await response.body?.cancel();
        return {
          kind: 'rate_limited',
          retryAfterSeconds: parseRetryAfter(response.headers.get('retry-after'), now()),
        };
      }
      const error = await describe(response);
      if (response.status === IDEMPOTENCY_CONFLICT_STATUS) return { kind: 'key_reused', error };
      const retryable = response.status === 408 || response.status >= 500;
      return retryable ? { kind: 'retryable', error } : { kind: 'rejected', error };
    },
  };
}
