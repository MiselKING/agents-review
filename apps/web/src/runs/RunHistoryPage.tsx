import { useState } from 'react';
import { Link } from 'react-router';

import type { SyncRunStatus } from '../gql/graphql';
import { ButtonLink } from '../ui/Button';
import { Pager } from '../ui/Pager';
import { ErrorState, LoadingState, RefreshFailedNote, TryAgainButton } from '../ui/states';
import { RUNS_PAGE_SIZE, useSyncRuns } from './api';
import { formatDateTime, formatDuration, isFinished, statusLabel } from './format';

const statusColors: Record<SyncRunStatus, string> = {
  QUEUED: 'bg-slate-100 text-slate-700',
  RUNNING: 'bg-blue-100 text-blue-800',
  SUCCEEDED: 'bg-green-100 text-green-800',
  FAILED: 'bg-red-100 text-red-800',
};

const NONE = '—';

const columns = [
  'Audience',
  'Status',
  'Members',
  'Synced',
  'Failed',
  'Started',
  'Duration',
  'Error',
] as const;
const numeric = new Set<string>(['Members', 'Synced', 'Failed']);

export function RunHistoryPage() {
  // Cursors of the pages visited; the last one is the current page, null the first.
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  const pageIndex = cursors.length - 1;
  const runs = useSyncRuns(cursors[pageIndex] ?? null);

  let content: React.ReactNode;
  if (runs.isPending) {
    content = <LoadingState label="Loading runs…" />;
  } else if (runs.data === undefined) {
    const retry = <TryAgainButton onClick={() => void runs.refetch()} />;
    if (pageIndex === 0) {
      content = <ErrorState title="Runs could not be loaded." error={runs.error} action={retry} />;
    } else {
      const first = pageIndex * RUNS_PAGE_SIZE + 1;
      const last = first + RUNS_PAGE_SIZE - 1;
      content = (
        <>
          <ErrorState
            title={`Runs ${first.toLocaleString('en')}–${last.toLocaleString('en')} couldn't be loaded.`}
            error={runs.error}
            action={retry}
          />
          <Pager
            rangeLabel=""
            hasPrevious
            hasNext={false}
            onPrevious={() => setCursors((list) => list.slice(0, -1))}
            onNext={() => undefined}
          />
        </>
      );
    }
  } else {
    const { nodes, pageInfo } = runs.data;
    const isUpdating = runs.isPlaceholderData;
    const start = pageIndex * RUNS_PAGE_SIZE + 1;
    // The shown rows are the previous page's while updating, so no range fits them yet.
    const rangeLabel = isUpdating
      ? ''
      : nodes.length === 0
        ? 'No more runs'
        : `${start.toLocaleString('en')}–${(start + nodes.length - 1).toLocaleString('en')}`;

    const refreshNote = runs.isError ? (
      <RefreshFailedNote
        what="runs"
        updatedAt={runs.dataUpdatedAt}
        onRetry={() => void runs.refetch()}
      />
    ) : null;

    const body =
      nodes.length === 0 && pageIndex === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
          <h2 className="text-base font-semibold text-slate-900">No sync runs yet</h2>
          <p className="mt-1 text-sm text-slate-600">Start a sync from the audience list.</p>
          <ButtonLink to="/" variant="primary" className="mt-6">
            Go to audiences
          </ButtonLink>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table
              aria-busy={isUpdating}
              className={`w-full text-left text-sm ${isUpdating ? 'opacity-60' : ''}`}
            >
              <caption className="sr-only">Sync runs, newest first</caption>
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-medium tracking-wide text-slate-500 uppercase">
                <tr>
                  {columns.map((column) => (
                    <th
                      key={column}
                      scope="col"
                      className={`px-4 py-3 ${numeric.has(column) ? 'text-right' : ''}`}
                    >
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {nodes.map((run) => {
                  const finished = isFinished(run.status);
                  const started = run.startedAt ?? run.createdAt;
                  return (
                    <tr key={run.id} className="align-top">
                      <td className="px-4 py-3">
                        <Link
                          to={`/audiences/${run.audience.id}`}
                          className="font-medium text-indigo-700 hover:underline"
                        >
                          {run.audience.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[run.status]}`}
                        >
                          {statusLabel(run.status)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {run.status === 'QUEUED' ? NONE : run.memberCount.toLocaleString('en')}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {finished ? run.syncedCount.toLocaleString('en') : NONE}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {finished ? run.failedCount.toLocaleString('en') : NONE}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-slate-600">
                        <time dateTime={started}>{formatDateTime(started)}</time>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-slate-600 tabular-nums">
                        {finished && run.startedAt && run.finishedAt
                          ? formatDuration(
                              new Date(run.finishedAt).getTime() -
                                new Date(run.startedAt).getTime(),
                            )
                          : NONE}
                      </td>
                      <td className="max-w-xs px-4 py-3 break-words whitespace-pre-wrap text-red-700">
                        {run.error}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pager
            rangeLabel={rangeLabel}
            hasPrevious={pageIndex > 0}
            hasNext={pageInfo.hasNextPage && !isUpdating}
            isUpdating={isUpdating}
            onPrevious={() => setCursors((list) => list.slice(0, -1))}
            onNext={() => setCursors((list) => [...list, pageInfo.endCursor ?? null])}
          />
        </>
      );
    content = (
      <>
        {refreshNote}
        {body}
      </>
    );
  }

  return (
    <section className="space-y-6">
      <title>Run history · Agents-Driven Flow</title>
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Run history</h1>
      {content}
    </section>
  );
}
