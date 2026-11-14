import { requireEnv } from '@agents-review/shared/env';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { NodePgQueryResultHKT } from 'drizzle-orm/node-postgres';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import { Pool } from 'pg';

import * as schema from './schema.ts';

export { describeDatabaseUrl } from './url.ts';

/** Creates a Drizzle client on a pg pool. Call `pool.end()` when done. */
export function createDb(connectionString: string = requireEnv('DATABASE_URL')) {
  const pool = new Pool({ connectionString });
  const db = drizzle({ client: pool, schema });
  return { db, pool };
}

export type Db = ReturnType<typeof createDb>['db'];

/** A database client or a transaction: query helpers take either. */
export type Queryable = PgDatabase<NodePgQueryResultHKT, typeof schema>;
