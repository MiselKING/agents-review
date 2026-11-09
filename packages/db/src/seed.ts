// Seed data arrives with the data model (Phase 3). For now this checks the connection.
import { requireEnv } from '@agents-review/shared/env';
import { sql } from 'drizzle-orm';

import { createDb, describeDatabaseUrl } from './client.ts';

const databaseUrl = requireEnv('DATABASE_URL');
const { db, pool } = createDb(databaseUrl);
try {
  await db.execute(sql`select 1`);
  console.log(`Connected to ${describeDatabaseUrl(databaseUrl)}. Nothing to seed yet.`);
} finally {
  await pool.end();
}
