import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MockGraphqlErrors, mockGraphql, renderWithProviders } from '../test/render';
import { AudienceMembersPage } from './AudienceMembersPage';

afterEach(() => {
  vi.unstubAllGlobals();
});

const member = (n: number, country = 'DEU') => ({
  id: String(n),
  email: `person${n}@example.com`,
  firstName: `First${n}`,
  lastName: `Last${n}`,
  country,
});

const membersPage = (nodes: ReturnType<typeof member>[], hasNextPage: boolean) => ({
  data: { audience: { id: '7', members: { nodes, pageInfo: { hasNextPage, endCursor: 'c1' } } } },
});

const countries = () => ({
  countries: [
    { code: 'DEU', name: 'Germany' },
    { code: 'FRA', name: 'France' },
  ],
});

const renderPage = () =>
  renderWithProviders(
    <Routes>
      <Route path="/audiences/:id/members" element={<AudienceMembersPage />} />
    </Routes>,
    '/audiences/7/members',
  );

const summary = (memberCount: number) => ({
  audience: { id: '7', name: 'Germans', memberCount },
});

describe('AudienceMembersPage', () => {
  it('pages forward and back with the cursors visited', async () => {
    mockGraphql({
      AudienceSummary: () => summary(40),
      Countries: countries,
      AudienceMembers: ({ after }) =>
        after === null
          ? {
              audience: {
                id: '7',
                members: {
                  nodes: [member(1), member(2, 'FRA')],
                  pageInfo: { hasNextPage: true, endCursor: 'c2' },
                },
              },
            }
          : {
              audience: {
                id: '7',
                members: {
                  nodes: [member(3)],
                  pageInfo: { hasNextPage: false, endCursor: 'c3' },
                },
              },
            },
    });
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Germans', level: 1 })).toBeInTheDocument();
    expect(await screen.findByText('Germany (DEU)')).toBeInTheDocument();
    expect(screen.getByText('France (FRA)')).toBeInTheDocument();
    expect(screen.getByText('First1 Last1')).toBeInTheDocument();
    expect(screen.getByText('1–2 of 40')).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Members of Germans' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Edit audience' })).toHaveAttribute(
      'href',
      '/audiences/7',
    );
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText('person3@example.com')).toBeInTheDocument();
    expect(screen.getByText('26–26 of 40')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: 'Previous' }));
    expect(await screen.findByText('person1@example.com')).toBeInTheDocument();
    expect(screen.getByText('1–2 of 40')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Germans', level: 1 })).toBeInTheDocument();
    expect(screen.getByText('40 customers match now')).toBeInTheDocument();
  });

  it('keeps the current rows and says it is updating while the next page loads', async () => {
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    mockGraphql({
      AudienceSummary: () => summary(40),
      Countries: countries,
      AudienceMembers: async ({ after }) => {
        if (after === null) return membersPage([member(1)], true).data;
        await gate;
        return membersPage([member(3)], false).data;
      },
    });
    renderPage();
    await screen.findByText('person1@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));

    expect(await screen.findByText('Updating…')).toBeInTheDocument();
    expect(screen.getByText('person1@example.com')).toBeInTheDocument();
    expect(screen.getByRole('table')).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByText(/of 40/)).not.toBeInTheDocument();

    release?.();
    expect(await screen.findByText('person3@example.com')).toBeInTheDocument();
    expect(screen.queryByText('Updating…')).not.toBeInTheDocument();
    expect(screen.getByText('26–26 of 40')).toBeInTheDocument();
  });

  it('does not claim zero members when a later page is empty', async () => {
    mockGraphql({
      AudienceSummary: () => summary(26),
      Countries: countries,
      AudienceMembers: ({ after }) =>
        after === null ? membersPage([member(1)], true).data : membersPage([], false).data,
    });
    renderPage();
    await screen.findByText('person1@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));

    expect(await screen.findByText('No more members')).toBeInTheDocument();
    expect(screen.queryByText('0 of 0')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Previous' }));
    expect(await screen.findByText('1–1 of 26')).toBeInTheDocument();
  });

  it('says when no customers match, with a link to edit', async () => {
    mockGraphql({
      AudienceSummary: () => summary(0),
      Countries: countries,
      AudienceMembers: () => ({
        audience: {
          id: '7',
          members: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } },
        },
      }),
    });
    renderPage();
    expect(await screen.findByText('No customers match')).toBeInTheDocument();
    const edit = screen.getAllByRole('link', { name: 'Edit audience' });
    expect(edit.at(-1)).toHaveAttribute('href', '/audiences/7');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('says not found for an unknown or archived audience', async () => {
    mockGraphql({
      AudienceSummary: () => ({ audience: null }),
      Countries: countries,
      AudienceMembers: () => ({ audience: null }),
    });
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Audience not found' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to audiences' })).toHaveAttribute('href', '/');
  });

  it('says so when the API cannot be reached', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))),
    );
    renderPage();
    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('The members could not be loaded.')).toBeInTheDocument();
  });

  it('first shows a loading state', () => {
    mockGraphql({});
    renderPage();
    expect(screen.getByText('Loading members…')).toBeInTheDocument();
  });

  it('shows the whole-page error when the summary fails, and Try again recovers', async () => {
    let calls = 0;
    mockGraphql({
      AudienceSummary: () => {
        calls += 1;
        return calls === 1 ? new MockGraphqlErrors({ message: 'Database is down' }) : summary(40);
      },
      Countries: countries,
      AudienceMembers: () => membersPage([member(1)], false).data,
    });
    renderPage();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The members could not be loaded.');
    expect(screen.queryByRole('heading', { name: 'Germans' })).not.toBeInTheDocument();
    await userEvent.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { name: 'Germans', level: 1 })).toBeInTheDocument();
    expect(await screen.findByText('person1@example.com')).toBeInTheDocument();
  });

  it('keeps the heading when the first members page fails, and Try again recovers', async () => {
    let calls = 0;
    mockGraphql({
      AudienceSummary: () => summary(40),
      Countries: countries,
      AudienceMembers: () => {
        calls += 1;
        return calls === 1
          ? new MockGraphqlErrors({ message: 'Database is down' })
          : membersPage([member(1)], false).data;
      },
    });
    renderPage();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The members could not be loaded.');
    expect(alert).toHaveTextContent('Database is down');
    expect(screen.getByRole('heading', { name: 'Germans', level: 1 })).toBeInTheDocument();
    expect(screen.getByText('40 customers match now')).toBeInTheDocument();
    await userEvent.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('person1@example.com')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('keeps Previous when a later page fails, and Previous returns to page 1', async () => {
    mockGraphql({
      AudienceSummary: () => summary(40),
      Countries: countries,
      AudienceMembers: ({ after }) =>
        after === null
          ? membersPage([member(1)], true).data
          : new MockGraphqlErrors({ message: 'Database is down' }),
    });
    renderPage();
    await screen.findByText('person1@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent("Members 26–50 couldn't be loaded.");
    expect(screen.getByRole('heading', { name: 'Germans', level: 1 })).toBeInTheDocument();
    expect(screen.getByText('40 customers match now')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Previous' }));
    expect(await screen.findByText('person1@example.com')).toBeInTheDocument();
    expect(screen.getByText('1–1 of 40')).toBeInTheDocument();
  });

  it('keeps the table and notes it when a refresh fails', async () => {
    let failing = false;
    mockGraphql({
      AudienceSummary: () => summary(40),
      Countries: countries,
      AudienceMembers: () =>
        failing
          ? new MockGraphqlErrors({ message: 'Database is down' })
          : membersPage([member(1)], false).data,
    });
    const { queryClient } = renderPage();
    await screen.findByText('person1@example.com');
    failing = true;
    await act(() => queryClient.refetchQueries({ queryKey: ['audience', '7', 'members'] }));
    const note = await screen.findByRole('status');
    expect(note).toHaveTextContent(/Couldn't refresh\. Showing members as of \d{2}:\d{2}\./);
    expect(screen.getByText('person1@example.com')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    failing = false;
    await userEvent.click(within(note).getByRole('button', { name: 'Try again' }));
    await act(async () => {});
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('dates the members note by the member rows, not the summary', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-11-14T10:00:00'));
    let failing = false;
    mockGraphql({
      AudienceSummary: () => (failing ? new MockGraphqlErrors({ message: 'down' }) : summary(40)),
      Countries: countries,
      AudienceMembers: () =>
        failing
          ? new MockGraphqlErrors({ message: 'Database is down' })
          : membersPage([member(1)], false).data,
    });
    const { queryClient } = renderPage();
    await screen.findByText('person1@example.com');
    // The summary refreshes successfully later than the members.
    vi.setSystemTime(new Date('2026-11-14T10:05:00'));
    await act(() => queryClient.refetchQueries({ queryKey: ['audience', '7', 'summary'] }));
    failing = true;
    await act(() => queryClient.refetchQueries({ queryKey: ['audience', '7'] }));
    const note = await screen.findByRole('status');
    expect(note).toHaveTextContent('Showing members as of 10:00.');
  });
});
