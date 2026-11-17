import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { SyncRunStatus } from '../gql/graphql';
import { mockGraphql, renderWithProviders } from '../test/render';
import { RunHistoryPage } from './RunHistoryPage';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function run(overrides: Record<string, unknown> = {}) {
  return {
    id: '1',
    status: 'SUCCEEDED' as SyncRunStatus,
    memberCount: 1200,
    syncedCount: 1150,
    failedCount: 50,
    error: null,
    createdAt: '2026-11-14T09:59:00.000Z',
    startedAt: '2026-11-14T10:00:00.000Z',
    finishedAt: '2026-11-14T10:03:05.000Z',
    audience: { id: '7', name: 'Recent buyers' },
    ...overrides,
  };
}

const page = (nodes: unknown[], hasNextPage = false, endCursor: string | null = null) => ({
  syncRuns: { nodes, pageInfo: { hasNextPage, endCursor } },
});

const rowOf = async (name: string) => (await screen.findByRole('link', { name })).closest('tr')!;

describe('RunHistoryPage', () => {
  it('shows each status as a word', async () => {
    mockGraphql({
      SyncRuns: () =>
        page([
          run({ id: '1', status: 'QUEUED', audience: { id: '1', name: 'A' } }),
          run({ id: '2', status: 'RUNNING', audience: { id: '2', name: 'B' } }),
          run({ id: '3', status: 'SUCCEEDED', audience: { id: '3', name: 'C' } }),
          run({ id: '4', status: 'FAILED', error: 'x', audience: { id: '4', name: 'D' } }),
        ]),
    });
    renderWithProviders(<RunHistoryPage />);
    expect(await rowOf('A')).toHaveTextContent('Queued');
    expect(await rowOf('B')).toHaveTextContent('Running');
    expect(await rowOf('C')).toHaveTextContent('Succeeded');
    expect(await rowOf('D')).toHaveTextContent('Failed');
  });

  it('shows the counts, start time and duration of a finished run', async () => {
    mockGraphql({ SyncRuns: () => page([run()]) });
    renderWithProviders(<RunHistoryPage />);
    const cells = within(await rowOf('Recent buyers'))
      .getAllByRole('cell')
      .map((cell) => cell.textContent);
    expect(cells.slice(2, 5)).toEqual(['1,200', '1,150', '50']);
    expect(cells[5]).toContain('Nov 14, 2026');
    expect(cells[6]).toBe('3 min 5 s');
    expect(screen.getByRole('link', { name: 'Recent buyers' })).toHaveAttribute(
      'href',
      '/audiences/7',
    );
  });

  it('shows — for everything unknown while a run is queued', async () => {
    mockGraphql({
      SyncRuns: () =>
        page([
          run({
            status: 'QUEUED',
            memberCount: 0,
            syncedCount: 0,
            failedCount: 0,
            startedAt: null,
            finishedAt: null,
          }),
        ]),
    });
    renderWithProviders(<RunHistoryPage />);
    const cells = within(await rowOf('Recent buyers')).getAllByRole('cell');
    expect([2, 3, 4, 6].map((index) => cells[index]?.textContent)).toEqual(['—', '—', '—', '—']);
    // A queued run shows when it was created.
    expect(cells[5]).toHaveTextContent('Nov 14, 2026');
  });

  it('shows the members but — for the rest while a run is running', async () => {
    mockGraphql({
      SyncRuns: () =>
        page([run({ status: 'RUNNING', syncedCount: 0, failedCount: 0, finishedAt: null })]),
    });
    renderWithProviders(<RunHistoryPage />);
    const cells = within(await rowOf('Recent buyers')).getAllByRole('cell');
    expect([2, 3, 4, 6].map((index) => cells[index]?.textContent)).toEqual([
      '1,200',
      '—',
      '—',
      '—',
    ]);
  });

  it('shows the whole error of a failed run', async () => {
    const error = 'Batch 3 rejected\nStatus 500: upstream unavailable';
    mockGraphql({ SyncRuns: () => page([run({ status: 'FAILED', error })]) });
    renderWithProviders(<RunHistoryPage />);
    const cells = within(await rowOf('Recent buyers')).getAllByRole('cell');
    expect(cells[7]?.textContent).toBe(error);
  });

  it('refreshes while a run is active and stops once none is', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let calls = 0;
    const requests = mockGraphql({
      SyncRuns: () => {
        calls += 1;
        return page([run({ status: calls === 1 ? 'RUNNING' : 'SUCCEEDED' })]);
      },
    });
    renderWithProviders(<RunHistoryPage />);
    expect(await screen.findByText('Running')).toBeInTheDocument();
    await act(() => vi.advanceTimersByTimeAsync(5000));
    expect(await screen.findByText('Succeeded')).toBeInTheDocument();
    const count = requests.length;
    await act(() => vi.advanceTimersByTimeAsync(20_000));
    expect(requests).toHaveLength(count);
  });

  it('pages with Next and Previous', async () => {
    const user = userEvent.setup();
    const requests = mockGraphql({
      SyncRuns: (variables) =>
        variables.after === 'c1'
          ? page([run({ id: '2', audience: { id: '2', name: 'Second page' } })])
          : page([run({ id: '1', audience: { id: '1', name: 'First page' } })], true, 'c1'),
    });
    renderWithProviders(<RunHistoryPage />);
    expect(await screen.findByText('1–1')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByRole('link', { name: 'Second page' })).toBeInTheDocument();
    expect(requests.at(-1)?.variables).toMatchObject({ first: 25, after: 'c1' });
    await user.click(screen.getByRole('button', { name: 'Previous' }));
    expect(await screen.findByRole('link', { name: 'First page' })).toBeInTheDocument();
  });

  it('says so and links to the audiences when there are no runs', async () => {
    mockGraphql({ SyncRuns: () => page([]) });
    renderWithProviders(<RunHistoryPage />);
    expect(await screen.findByText('No sync runs yet')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to audiences' })).toHaveAttribute('href', '/');
  });

  it('shows a loading state', () => {
    mockGraphql({ SyncRuns: () => new Promise(() => undefined) });
    renderWithProviders(<RunHistoryPage />);
    expect(screen.getByText('Loading runs…')).toBeInTheDocument();
  });

  it('says so when the API cannot be reached', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))),
    );
    renderWithProviders(<RunHistoryPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Runs could not be loaded.');
  });
});
