/** `host:port/database` for logs. Never includes the user or password. */
export function describeDatabaseUrl(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  return `${url.hostname}:${url.port || '5432'}${url.pathname}`;
}

/**
 * Error message when the port in DATABASE_URL differs from POSTGRES_PORT (the port
 * Docker Compose publishes), or undefined when they match or POSTGRES_PORT isn't set.
 */
export function findPortMismatch(
  databaseUrl: string,
  postgresPort: string | undefined,
): string | undefined {
  if (postgresPort === undefined || postgresPort === '') return undefined;
  const urlPort = new URL(databaseUrl).port || '5432';
  if (urlPort === postgresPort) return undefined;
  return `DATABASE_URL uses port ${urlPort} but POSTGRES_PORT is ${postgresPort}. Update one of them in .env so they match.`;
}
