import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { mockGraphql, renderWithProviders } from '../test/render';
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
    const requests = mockGraphql({
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

    const memberRequests = requests.filter((r) => r.operation === 'AudienceMembers');
    expect(memberRequests.map((r) => r.variables.after)).toEqual([null, 'c2', null]);
    expect(requests.filter((r) => r.operation === 'AudienceSummary')).toHaveLength(1);
  });

  it('keeps the current rows and says it is updating while the next page loads', async () => {
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        const body = typeof init?.body === 'string' ? init.body : '';
        let payload: unknown;
        if (body.includes('query AudienceSummary')) payload = { data: summary(40) };
        else if (body.includes('query Countries')) payload = { data: countries() };
        else if (body.includes('"after":"c1"')) {
          await gate;
          payload = membersPage([member(3)], false);
        } else payload = membersPage([member(1)], true);
        return new Response(JSON.stringify(payload), {
          headers: { 'content-type': 'application/json' },
        });
      }),
    );
    renderPage();
    await screen.findByText('person1@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));

    expect(await screen.findByText('Updating…')).toBeInTheDocument();
    expect(screen.getByText('person1@example.com')).toBeInTheDocument();
    expect(screen.getByRole('table')).toHaveAttribute('aria-busy', 'true');

    release?.();
    expect(await screen.findByText('person3@example.com')).toBeInTheDocument();
    expect(screen.queryByText('Updating…')).not.toBeInTheDocument();
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

  it('shows a loading state first', () => {
    mockGraphql({});
    renderPage();
    expect(screen.getByText('Loading members…')).toBeInTheDocument();
  });
});
