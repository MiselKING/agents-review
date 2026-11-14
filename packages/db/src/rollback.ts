import type { Db } from './client.ts';

export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

class Rollback extends Error {}

/** For tests: runs `run` in a transaction that is always rolled back, so it leaves no rows behind. */
export async function inRollback<T>(db: Db, run: (tx: Tx) => Promise<T>): Promise<T> {
  const results: { value: T }[] = [];
  try {
    await db.transaction(async (tx) => {
      results.push({ value: await run(tx) });
      throw new Rollback();
    });
  } catch (error) {
    if (!(error instanceof Rollback)) throw error;
  }
  const [result] = results;
  if (!result) throw new Error('The transaction did not finish.');
  return result.value;
}
