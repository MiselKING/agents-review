import { requireEnv } from '@agents-review/shared/env';

type Env = Record<string, string | undefined>;

export interface WorkerSettings {
  /** Base URL of the ad platform, like http://localhost:4100. */
  destinationUrl: URL;
}

export function readSettings(env: Env = process.env): WorkerSettings {
  const name = 'SYNC_DESTINATION_URL';
  const raw = requireEnv(name, env);
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`${name} must be an http or https URL, got "${raw}".`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`${name} must be an http or https URL, got "${raw}".`);
  }
  return { destinationUrl: url };
}
