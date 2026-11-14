import { requireEnv } from '@agents-review/shared/env';

import { createDb, describeDatabaseUrl } from './client.ts';
import { seedDatabase } from './seed-database.ts';

const databaseUrl = requireEnv('DATABASE_URL');
const { db, pool } = createDb(databaseUrl);
try {
  const started = Date.now();
  const counts = await seedDatabase(db);
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  console.log(
    `Seeded ${counts.customers} customers, ${counts.events} events and ${counts.audiences} sample audiences into ${describeDatabaseUrl(databaseUrl)} in ${seconds}s.`,
  );
} finally {
  await pool.end();
}
