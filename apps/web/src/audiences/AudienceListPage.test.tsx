import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { mockGraphql, renderWithProviders } from '../test/render';
import { AudienceListPage } from './AudienceListPage';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AudienceListPage', () => {
  it('offers to create the first audience when there are none', async () => {
    mockGraphql({ Audiences: () => ({ audiences: [] }) });
    renderWithProviders(<AudienceListPage />);
    expect(await screen.findByText('No audiences yet')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Create your first audience' })).toHaveAttribute(
      'href',
      '/audiences/new',
    );
  });

  it('lists each audience with its member count and creation date', async () => {
    mockGraphql({
      Audiences: () => ({
        audiences: [
          {
            id: '7',
            name: 'Recent buyers',
            memberCount: 1234,
            createdAt: '2026-11-14T10:00:00.000Z',
          },
        ],
      }),
    });
    renderWithProviders(<AudienceListPage />);
    const link = await screen.findByRole('link', { name: 'Recent buyers' });
    expect(link).toHaveAttribute('href', '/audiences/7');
    const row = link.closest('tr');
    expect(row).toHaveTextContent('1,234');
    expect(row).toHaveTextContent('Nov 14, 2026');
    expect(screen.getByRole('button', { name: 'Archive Recent buyers' })).toBeInTheDocument();
  });

  it('says so when the API cannot be reached', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))),
    );
    renderWithProviders(<AudienceListPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Audiences could not be loaded.');
  });
});
