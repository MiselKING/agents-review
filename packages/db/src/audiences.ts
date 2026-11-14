import type { AudienceFilter } from '@agents-review/shared/audience-filter';
import { and, desc, eq, isNull } from 'drizzle-orm';

import type { Queryable } from './client.ts';
import { audiences } from './schema.ts';

export type AudienceRow = typeof audiences.$inferSelect;

const active = (id: number) => and(eq(audiences.id, id), isNull(audiences.archivedAt));

/** Audiences that aren't archived, newest first. */
export function listAudiences(db: Queryable): Promise<AudienceRow[]> {
  return db
    .select()
    .from(audiences)
    .where(isNull(audiences.archivedAt))
    .orderBy(desc(audiences.createdAt), desc(audiences.id));
}

/** The audience, or undefined when it doesn't exist or is archived. */
export async function findAudience(db: Queryable, id: number): Promise<AudienceRow | undefined> {
  const [row] = await db.select().from(audiences).where(active(id));
  return row;
}

export async function insertAudience(
  db: Queryable,
  values: { name: string; definition: AudienceFilter },
): Promise<AudienceRow> {
  const [row] = await db.insert(audiences).values(values).returning();
  if (!row) throw new Error('Audience insert returned no row.');
  return row;
}

/** Updates an active audience; undefined when it doesn't exist or is archived. */
export async function updateAudience(
  db: Queryable,
  id: number,
  values: { name?: string; definition?: AudienceFilter },
): Promise<AudienceRow | undefined> {
  const [row] = await db.update(audiences).set(values).where(active(id)).returning();
  return row;
}

/** Archives an active audience; undefined when it doesn't exist or is already archived. */
export async function archiveAudience(db: Queryable, id: number): Promise<AudienceRow | undefined> {
  const [row] = await db
    .update(audiences)
    .set({ archivedAt: new Date() })
    .where(active(id))
    .returning();
  return row;
}
