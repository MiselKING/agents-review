import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MockGraphqlErrors, mockGraphql, renderWithProviders } from '../test/render';
import { AudienceListPage } from './AudienceListPage';

afterEach(() => {
  vi.unstubAllGlobals();
});

const audiences = () => ({
  audiences: ['A', 'B'].map((name, index) => ({
    id: String(index + 1),
    name,
    memberCount: 10,
    createdAt: '2026-11-14T10:00:00.000Z',
  })),
});

const rowOf = async (name: string) => (await screen.findByRole('link', { name })).closest('tr')!;

describe('Sync now on the audience list', () => {
  it('starts a sync of that audience and says so on its row', async () => {
    const user = userEvent.setup();
    const requests = mockGraphql({
      Audiences: audiences,
      StartSync: () => ({ startSync: { id: '9' } }),
      SyncRuns: () => ({ syncRuns: { nodes: [], pageInfo: { hasNextPage: false } } }),
    });
    renderWithProviders(<AudienceListPage />);
    await user.click(await screen.findByRole('button', { name: 'Sync now B' }));
    const row = await rowOf('B');
    expect(await within(row).findByText(/Sync started/)).toBeInTheDocument();
    expect(within(row).getByRole('link', { name: 'View run history' })).toHaveAttribute(
      'href',
      '/runs',
    );
    expect(requests.filter((request) => request.operation === 'StartSync')).toEqual([
      { operation: 'StartSync', variables: { audienceId: '2' } },
    ]);
    expect(within(await rowOf('A')).queryByText(/Sync started/)).toBeNull();
  });

  it('works from the keyboard', async () => {
    const user = userEvent.setup();
    mockGraphql({ Audiences: audiences, StartSync: () => ({ startSync: { id: '9' } }) });
    renderWithProviders(<AudienceListPage />);
    const button = await screen.findByRole('button', { name: 'Sync now A' });
    button.focus();
    await user.keyboard('{Enter}');
    expect(await screen.findByText(/Sync started/)).toBeInTheDocument();
  });

  it('starts only one sync on a double click', async () => {
    const user = userEvent.setup();
    const pending: (() => void)[] = [];
    const requests = mockGraphql({
      Audiences: audiences,
      StartSync: () =>
        new Promise((resolve) => {
          pending.push(() => resolve({ startSync: { id: '9' } }));
        }),
    });
    renderWithProviders(<AudienceListPage />);
    await user.dblClick(await screen.findByRole('button', { name: 'Sync now A' }));
    pending.forEach((finish) => finish());
    expect(await screen.findByText(/Sync started/)).toBeInTheDocument();
    expect(requests.filter((request) => request.operation === 'StartSync')).toHaveLength(1);
  });

  it('keeps one row pending without affecting the others', async () => {
    const user = userEvent.setup();
    const requests = mockGraphql({
      Audiences: audiences,
      StartSync: (variables) =>
        variables.audienceId === '1' ? new Promise(() => undefined) : { startSync: { id: '9' } },
    });
    renderWithProviders(<AudienceListPage />);
    await user.click(await screen.findByRole('button', { name: 'Sync now A' }));
    const pending = within(await rowOf('A')).getByRole('button', { name: 'Starting…' });
    expect(pending).toBeDisabled();
    const other = screen.getByRole('button', { name: 'Sync now B' });
    expect(other).toBeEnabled();
    await user.click(other);
    expect(await within(await rowOf('B')).findByText(/Sync started/)).toBeInTheDocument();
    expect(requests.filter((request) => request.operation === 'StartSync')).toHaveLength(2);
  });

  it('says a sync is already in progress, with a link to the run history', async () => {
    const user = userEvent.setup();
    mockGraphql({
      Audiences: audiences,
      StartSync: () =>
        new MockGraphqlErrors({
          message: 'A sync of this audience is already queued or running.',
          code: 'SYNC_IN_PROGRESS',
        }),
    });
    renderWithProviders(<AudienceListPage />);
    await user.click(await screen.findByRole('button', { name: 'Sync now A' }));
    const row = await rowOf('A');
    expect(await within(row).findByText(/already queued or running/)).toBeInTheDocument();
    expect(within(row).getByRole('link', { name: 'View run history' })).toHaveAttribute(
      'href',
      '/runs',
    );
    expect(within(row).queryByRole('alert')).toBeNull();
    expect(within(row).getByRole('button', { name: 'Sync now A' })).toBeEnabled();
  });

  it('shows any other error on the row', async () => {
    const user = userEvent.setup();
    mockGraphql({
      Audiences: audiences,
      StartSync: () => new MockGraphqlErrors({ message: 'Database is down' }),
    });
    renderWithProviders(<AudienceListPage />);
    await user.click(await screen.findByRole('button', { name: 'Sync now A' }));
    expect(await within(await rowOf('A')).findByRole('alert')).toHaveTextContent(
      'Could not start the sync: Database is down',
    );
  });
});
