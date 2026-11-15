import {
  countAudienceMembers,
  listAudienceMembers,
  type MemberPage,
} from '@agents-review/db/audience-members';
import {
  archiveAudience,
  findAudience,
  insertAudience,
  listAudiences,
  updateAudience,
} from '@agents-review/db/audiences';
import { listCustomerCountries } from '@agents-review/db/customers';
import {
  findSyncRun,
  listSyncRuns,
  startSyncRun,
  type SyncRunRow,
} from '@agents-review/db/sync-runs';
import { parseAudienceName } from '@agents-review/shared/audience-filter';
import { GraphQLError, GraphQLScalarType, Kind } from 'graphql';

import { filterFromInput, filterToOutput } from './audience-filter-mapper.ts';
import { toCountryOptions } from './countries.ts';
import type { Resolvers, SyncRunStatus } from './generated/graphql.ts';

const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 25;

const badInput = (errors: string[]) =>
  new GraphQLError(errors.join(' '), { extensions: { code: 'BAD_USER_INPUT', errors } });

const notFound = (id: string) =>
  new GraphQLError(`Audience ${id} not found.`, { extensions: { code: 'NOT_FOUND' } });

const SYNC_RUN_STATUSES: Record<SyncRunRow['status'], SyncRunStatus> = {
  queued: 'QUEUED',
  running: 'RUNNING',
  succeeded: 'SUCCEEDED',
  failed: 'FAILED',
};

/** A database id from a GraphQL ID or cursor, or undefined when it can't be one. */
function parseId(value: string): number | undefined {
  if (!/^[1-9]\d{0,15}$/.test(value)) return undefined;
  const id = Number(value);
  return Number.isSafeInteger(id) ? id : undefined;
}

function parsePage(first: number | null | undefined, after: string | null | undefined) {
  const size = first ?? DEFAULT_PAGE_SIZE;
  if (size < 1 || size > MAX_PAGE_SIZE) {
    throw badInput([`first must be from 1 to ${MAX_PAGE_SIZE}, got ${size}.`]);
  }
  if (after === null || after === undefined) return { first: size };
  const afterId = parseId(after);
  if (afterId === undefined) throw badInput(['after must be an endCursor from a previous page.']);
  return { first: size, after: afterId };
}

const toConnection = ({ members, hasNextPage }: MemberPage) => {
  const last = members.at(-1);
  return { nodes: members, pageInfo: { hasNextPage, endCursor: last ? String(last.id) : null } };
};

function parseDateTime(value: unknown): Date {
  const date = typeof value === 'string' ? new Date(value) : undefined;
  if (!date || Number.isNaN(date.getTime())) {
    throw new TypeError('DateTime must be an ISO 8601 string.');
  }
  return date;
}

const DateTime = new GraphQLScalarType<Date, string>({
  name: 'DateTime',
  coerceOutputValue: (value) => {
    if (!(value instanceof Date)) throw new TypeError('DateTime must be a Date.');
    return value.toISOString();
  },
  coerceInputValue: parseDateTime,
  coerceInputLiteral: (ast) => parseDateTime(ast.kind === Kind.STRING ? ast.value : undefined),
});

export const resolvers: Resolvers = {
  DateTime,

  Query: {
    hello: () => 'Hello from the API',
    countries: async (_parent, _args, { db }) => toCountryOptions(await listCustomerCountries(db)),
    audiences: (_parent, _args, { db }) => listAudiences(db),
    audience: async (_parent, { id }, { db }) => {
      const audienceId = parseId(id);
      if (audienceId === undefined) return null;
      return (await findAudience(db, audienceId)) ?? null;
    },
    previewAudience: (_parent, { definition, first, after }) => {
      const filter = filterFromInput(definition);
      if (!filter.ok) throw badInput(filter.errors);
      return { filter: filter.value, page: parsePage(first, after) };
    },
    syncRuns: async (_parent, { audienceId, first, after }, { db }) => {
      const page = parsePage(first, after);
      const audience = typeof audienceId === 'string' ? parseId(audienceId) : undefined;
      if (typeof audienceId === 'string' && audience === undefined) {
        return { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } };
      }
      const { runs, hasNextPage } = await listSyncRuns(db, { ...page, audienceId: audience });
      const last = runs.at(-1);
      return { nodes: runs, pageInfo: { hasNextPage, endCursor: last ? String(last.id) : null } };
    },
    syncRun: async (_parent, { id }, { db }) => {
      const runId = parseId(id);
      if (runId === undefined) return null;
      return (await findSyncRun(db, runId)) ?? null;
    },
  },

  Mutation: {
    createAudience: async (_parent, { input }, { db }) => {
      const name = parseAudienceName(input.name);
      const filter = filterFromInput(input.definition);
      if (!name.ok || !filter.ok) {
        throw badInput([...(name.ok ? [] : name.errors), ...(filter.ok ? [] : filter.errors)]);
      }
      return insertAudience(db, { name: name.value, definition: filter.value });
    },
    updateAudience: async (_parent, { id, input }, { db }) => {
      const audienceId = parseId(id);
      if (audienceId === undefined) throw notFound(id);
      if (typeof input.name !== 'string' && !input.definition) {
        throw badInput(['Give a name, a definition, or both to update.']);
      }
      const name = typeof input.name === 'string' ? parseAudienceName(input.name) : undefined;
      const filter = input.definition ? filterFromInput(input.definition) : undefined;
      const errors = [
        ...(name && !name.ok ? name.errors : []),
        ...(filter && !filter.ok ? filter.errors : []),
      ];
      if (errors.length > 0) throw badInput(errors);
      const updated = await updateAudience(db, audienceId, {
        ...(name?.ok ? { name: name.value } : {}),
        ...(filter?.ok ? { definition: filter.value } : {}),
      });
      if (!updated) throw notFound(id);
      return updated;
    },
    archiveAudience: async (_parent, { id }, { db }) => {
      const audienceId = parseId(id);
      const archived = audienceId === undefined ? undefined : await archiveAudience(db, audienceId);
      if (!archived) throw notFound(id);
      return archived;
    },
    startSync: async (_parent, { audienceId }, { db }) => {
      const id = parseId(audienceId);
      const audience = id === undefined ? undefined : await findAudience(db, id);
      if (!audience) throw notFound(audienceId);
      const started = await startSyncRun(db, audience.id);
      if (!started.ok) {
        throw new GraphQLError('A sync of this audience is already queued or running.', {
          extensions: { code: 'SYNC_IN_PROGRESS' },
        });
      }
      return { ...started.run, audience };
    },
  },

  Audience: {
    id: (audience) => String(audience.id),
    definition: (audience) => filterToOutput(audience.definition),
    memberCount: (audience, _args, { db, now }) =>
      countAudienceMembers(db, audience.definition, now),
    members: async (audience, { first, after }, { db, now }) =>
      toConnection(
        await listAudienceMembers(db, audience.definition, parsePage(first, after), now),
      ),
  },

  AudiencePreview: {
    memberCount: ({ filter }, _args, { db, now }) => countAudienceMembers(db, filter, now),
    members: async ({ filter, page }, _args, { db, now }) =>
      toConnection(await listAudienceMembers(db, filter, page, now)),
  },

  Member: {
    id: (member) => String(member.id),
  },

  SyncRun: {
    id: (run) => String(run.id),
    status: (run) => SYNC_RUN_STATUSES[run.status],
  },

  FilterCondition: {
    __resolveType: (condition) => {
      if ('field' in condition) return 'AttributeCondition';
      return 'eventType' in condition ? 'EventCondition' : 'SignedUpCondition';
    },
  },
};
