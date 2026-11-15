import { MAX_MEMBERS_PER_BATCH } from '@agents-review/shared/ad-platform';

/** The worker's timing and limits. Tests use smaller values; see issue #25 for the reasoning. */
export interface Policy {
  pollMs: number;
  batchSize: number;
  requestTimeoutMs: number;
  maxAttempts: number;
  /** Wait before retry n is backoffMs[n - 1], plus up to jitterMs. */
  backoffMs: readonly number[];
  jitterMs: number;
  /** A rate limit asking for a longer wait fails the batch at once instead of blocking the worker. */
  maxRetryAfterMs: number;
  /** Most time one batch may spend waiting out rate limits before it fails. */
  maxRateLimitWaitMs: number;
  heartbeatMs: number;
  /** A running run whose heartbeat is older than this is taken over. */
  staleSeconds: number;
}

export const DEFAULT_POLICY: Policy = {
  pollMs: 2000,
  batchSize: MAX_MEMBERS_PER_BATCH,
  requestTimeoutMs: 10_000,
  maxAttempts: 5,
  backoffMs: [1000, 2000, 4000, 8000],
  jitterMs: 250,
  maxRetryAfterMs: 60_000,
  maxRateLimitWaitMs: 120_000,
  heartbeatMs: 10_000,
  staleSeconds: 60,
};
