const WINDOW_MS = 1000;

/**
 * Allows `limit` requests in any 1-second window; 0 means no limit.
 * Returns 0 when a request may go ahead, otherwise the whole seconds to wait.
 */
export function createRateLimiter(limit: number, now: () => number) {
  const recent: number[] = [];
  return function take(): number {
    if (limit === 0) return 0;
    const time = now();
    while (recent.length > 0 && (recent[0] ?? 0) <= time - WINDOW_MS) recent.shift();
    if (recent.length >= limit) {
      const oldest = recent[0] ?? time;
      return Math.max(1, Math.ceil((oldest + WINDOW_MS - time) / 1000));
    }
    recent.push(time);
    return 0;
  };
}
