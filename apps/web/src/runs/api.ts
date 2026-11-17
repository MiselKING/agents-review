import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { graphql } from '../gql';
import { execute } from '../graphql/execute';

export const RUNS_PAGE_SIZE = 25;
export const RUNS_REFRESH_MS = 5000;

const SyncRunsQuery = graphql(`
  query SyncRuns($first: Int!, $after: String) {
    syncRuns(first: $first, after: $after) {
      nodes {
        id
        status
        memberCount
        syncedCount
        failedCount
        error
        createdAt
        startedAt
        finishedAt
        audience {
          id
          name
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`);

const StartSyncMutation = graphql(`
  mutation StartSync($audienceId: ID!) {
    startSync(audienceId: $audienceId) {
      id
    }
  }
`);

const SYNC_RUNS_KEY = 'sync-runs';

/** One page of runs, refreshed every few seconds while a run on the page is queued or running. */
export function useSyncRuns(after: string | null) {
  return useQuery({
    queryKey: [SYNC_RUNS_KEY, after],
    queryFn: async () => (await execute(SyncRunsQuery, { first: RUNS_PAGE_SIZE, after })).syncRuns,
    // Keep the current rows on screen while the next page loads.
    placeholderData: (previous) => previous,
    refetchInterval: (query) =>
      query.state.data?.nodes.some((run) => run.status === 'QUEUED' || run.status === 'RUNNING')
        ? RUNS_REFRESH_MS
        : false,
  });
}

export function useStartSync() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (audienceId: string) =>
      (await execute(StartSyncMutation, { audienceId })).startSync,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [SYNC_RUNS_KEY] }),
  });
}
