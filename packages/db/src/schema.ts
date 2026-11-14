// After any change: `pnpm db:generate`, then `pnpm db:migrate`.
import type { AudienceFilter } from '@agents-review/shared/audience-filter';
import type { EventProperties } from '@agents-review/shared/events';
import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const SYNC_RUN_STATUSES = ['queued', 'running', 'succeeded', 'failed'] as const;
export type SyncRunStatus = (typeof SYNC_RUN_STATUSES)[number];

export const SYNC_BATCH_STATUSES = ['pending', 'sent', 'failed'] as const;
export type SyncBatchStatus = (typeof SYNC_BATCH_STATUSES)[number];

const id = () => bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity();

const time = (name: string) => timestamp(name, { withTimezone: true });

// Postgres has no "on update" default, so Drizzle sets updated_at on every update it runs.
const timestamps = {
  createdAt: time('created_at').notNull().defaultNow(),
  updatedAt: time('updated_at')
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

// Constraint SQL is stored in the migration as text, so values are inlined, not bound.
const quotedList = (values: readonly string[]) =>
  sql.raw(values.map((value) => `'${value}'`).join(', '));

export const customers = pgTable(
  'customers',
  {
    id: id(),
    email: text('email').notNull(),
    firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull(),
    country: text('country').notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('customers_email_lower_unique').on(sql`lower(${table.email})`),
    check('customers_country_iso3', sql`${table.country} ~ '^[A-Z]{3}$'`),
  ],
);

export const events = pgTable(
  'events',
  {
    id: id(),
    customerId: bigint('customer_id', { mode: 'number' })
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    // No database constraint: allowed types live in @agents-review/shared/events.
    type: text('type').notNull(),
    occurredAt: time('occurred_at').notNull(),
    // Required, with no default: an empty object is not valid for any event type.
    properties: jsonb('properties').$type<EventProperties>().notNull(),
    ...timestamps,
  },
  (table) => [
    index('events_customer_type_occurred_idx').on(table.customerId, table.type, table.occurredAt),
    // customer_id is a trailing key column because Drizzle can't express INCLUDE.
    index('events_type_occurred_customer_idx').on(table.type, table.occurredAt, table.customerId),
  ],
);

export const audiences = pgTable('audiences', {
  id: id(),
  name: text('name').notNull(),
  // Validated with parseAudienceFilter from @agents-review/shared/audience-filter before it's written.
  definition: jsonb('definition').$type<AudienceFilter>().notNull(),
  archivedAt: time('archived_at'),
  ...timestamps,
});

export const syncRuns = pgTable(
  'sync_runs',
  {
    id: id(),
    audienceId: bigint('audience_id', { mode: 'number' })
      .notNull()
      .references(() => audiences.id, { onDelete: 'restrict' }),
    status: text('status', { enum: SYNC_RUN_STATUSES }).notNull().default('queued'),
    memberCount: integer('member_count').notNull().default(0),
    syncedCount: integer('synced_count').notNull().default(0),
    failedCount: integer('failed_count').notNull().default(0),
    error: text('error'),
    startedAt: time('started_at'),
    finishedAt: time('finished_at'),
    heartbeatAt: time('heartbeat_at'),
    ...timestamps,
  },
  (table) => [
    check('sync_runs_status_check', sql`${table.status} in (${quotedList(SYNC_RUN_STATUSES)})`),
    index('sync_runs_audience_created_idx').on(table.audienceId, table.createdAt),
    index('sync_runs_queued_idx')
      .on(table.createdAt)
      .where(sql`${table.status} = 'queued'`),
    uniqueIndex('sync_runs_one_active_per_audience')
      .on(table.audienceId)
      .where(sql`${table.status} in ('queued', 'running')`),
  ],
);

export const syncBatches = pgTable(
  'sync_batches',
  {
    id: id(),
    runId: bigint('run_id', { mode: 'number' })
      .notNull()
      .references(() => syncRuns.id, { onDelete: 'cascade' }),
    batchIndex: integer('batch_index').notNull(),
    idempotencyKey: uuid('idempotency_key').notNull().defaultRandom(),
    customerIds: bigint('customer_ids', { mode: 'number' }).array().notNull(),
    status: text('status', { enum: SYNC_BATCH_STATUSES }).notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    nextAttemptAt: time('next_attempt_at'),
    lastError: text('last_error'),
    ...timestamps,
  },
  (table) => [
    check(
      'sync_batches_status_check',
      sql`${table.status} in (${quotedList(SYNC_BATCH_STATUSES)})`,
    ),
    uniqueIndex('sync_batches_run_batch_unique').on(table.runId, table.batchIndex),
    uniqueIndex('sync_batches_idempotency_key_unique').on(table.idempotencyKey),
  ],
);
