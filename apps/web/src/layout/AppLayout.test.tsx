import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';

import { AppLayout } from './AppLayout';

function renderAt(path: string) {
  const router = createMemoryRouter(
    [{ element: <AppLayout />, children: [{ path: '*', element: <p>Page</p> }] }],
    { initialEntries: [path] },
  );
  render(<RouterProvider router={router} />);
}

describe('AppLayout', () => {
  it('marks the Audiences link as the current page on the list', () => {
    renderAt('/');
    expect(screen.getByRole('link', { name: 'Audiences' })).toHaveAttribute('aria-current', 'page');
  });

  it('keeps the Audiences link highlighted inside an audience', () => {
    renderAt('/audiences/7');
    expect(screen.getByRole('link', { name: 'Audiences' })).toHaveAttribute('aria-current', 'true');
  });

  it('leaves the Audiences link plain elsewhere', () => {
    renderAt('/somewhere-else');
    expect(screen.getByRole('link', { name: 'Audiences' })).not.toHaveAttribute('aria-current');
  });
});
