// Placeholder process: starts with `pnpm dev` and stays up. Sync logic comes in a later issue.
const HEARTBEAT_MS = 60_000;

console.log('Sync worker started (no sync jobs yet)');
const heartbeat = setInterval(() => console.log('Sync worker idle'), HEARTBEAT_MS);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    console.log(`Sync worker stopping (${signal})`);
    clearInterval(heartbeat);
  });
}
