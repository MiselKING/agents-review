/** The worker's timing and limits. Tests use smaller values; see issue #25 for the reasoning. */
export interface Policy {
  pollMs: number;
  batchSize: number;
  requestTimeoutMs: number;
  maxAttempts: number;
  /** Wait before retry n is backoffMs[n - 1], plus up to jitterMs. */
  backoffMs: readonly number[];
  jitterMs: number;
  maxRateLimitedInARow: number;
  heartbeatMs: number;
  /** A running run whose heartbeat is older than this is taken over. */
  staleSeconds: number;
}

export const DEFAULT_POLICY: Policy = {
  pollMs: 2000,
  batchSize: 500,
  requestTimeoutMs: 10_000,
  maxAttempts: 5,
  backoffMs: [1000, 2000, 4000, 8000],
  jitterMs: 250,
  maxRateLimitedInARow: 20,
  heartbeatMs: 10_000,
  staleSeconds: 60,
};
