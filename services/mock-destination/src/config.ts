import { requireEnv } from '@agents-review/shared/env';

type Env = Record<string, string | undefined>;

export interface DestinationSettings {
  /** Share of POST requests that fail with a 500, from 0 to 1. */
  failureRate: number;
  /** Requests allowed per second across all callers; 0 means no limit. */
  rateLimitPerSecond: number;
}

function readNumber(
  name: string,
  env: Env,
  { min, max, integer }: { min: number; max: number; integer: boolean },
) {
  const raw = requireEnv(name, env);
  const value = Number(raw);
  const valid =
    raw.trim() !== '' &&
    Number.isFinite(value) &&
    value >= min &&
    value <= max &&
    (!integer || Number.isInteger(value));
  if (!valid) {
    const kind = integer ? 'a whole number' : 'a number';
    throw new Error(`${name} must be ${kind} from ${min} to ${max}, got "${raw}".`);
  }
  return value;
}

export function readSettings(env: Env = process.env): DestinationSettings {
  return {
    failureRate: readNumber('MOCK_DESTINATION_FAILURE_RATE', env, {
      min: 0,
      max: 1,
      integer: false,
    }),
    rateLimitPerSecond: readNumber('MOCK_DESTINATION_RATE_LIMIT_PER_SECOND', env, {
      min: 0,
      max: 100_000,
      integer: true,
    }),
  };
}
