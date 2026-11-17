import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderWithProviders } from '../test/render';
import { AppLayout } from './AppLayout';

const renderAt = (path: string) => renderWithProviders(<AppLayout />, path);

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

  it('highlights Run history on its page only', () => {
    renderAt('/runs');
    expect(screen.getByRole('link', { name: 'Run history' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'Audiences' })).not.toHaveAttribute('aria-current');
  });

  it('leaves Run history plain on the list', () => {
    renderAt('/');
    expect(screen.getByRole('link', { name: 'Run history' })).not.toHaveAttribute('aria-current');
  });
});
