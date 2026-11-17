import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { renderWithProviders } from '../test/render';
import { Pager } from './Pager';

const ranges = ['1–25 of 60', '26–50 of 60', '51–60 of 60'];

function Pages() {
  const [page, setPage] = useState(1);
  return (
    <Pager
      rangeLabel={ranges[page] ?? ''}
      hasPrevious={page > 0}
      hasNext={page < ranges.length - 1}
      onPrevious={() => setPage((current) => current - 1)}
      onNext={() => setPage((current) => current + 1)}
    />
  );
}

describe('Pager', () => {
  it('shows the range and moves between pages', async () => {
    renderWithProviders(<Pages />);
    expect(screen.getByText('26–50 of 60')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('51–60 of 60')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: 'Previous' }));
    await userEvent.click(screen.getByRole('button', { name: 'Previous' }));
    expect(screen.getByText('1–25 of 60')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
  });

  it('disables Previous and Next at the ends and says when updating', () => {
    renderWithProviders(
      <Pager
        rangeLabel="1–5 of 5"
        hasPrevious={false}
        hasNext={false}
        onPrevious={vi.fn<() => void>()}
        onNext={vi.fn<() => void>()}
        isUpdating
      />,
    );
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    expect(screen.getByText('Updating…')).toBeInTheDocument();
  });
});
