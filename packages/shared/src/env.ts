type Env = Record<string, string | undefined>;

/** Reads a required variable. Defaults live in .env.example, not in code. */
export function requireEnv(name: string, env: Env = process.env): string {
  const value = env[name];
  if (value === undefined || value === '') {
    throw new Error(
      `Missing environment variable ${name}. Copy .env.example to .env in the repo root.`,
    );
  }
  return value;
}

export function readPort(name: string, env: Env = process.env): number {
  const raw = requireEnv(name, env);
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`${name} must be a port number from 1 to 65535, got "${raw}".`);
  }
  return port;
}

// CI failure demo: lint must reject this.
export const demo: any = 1;
