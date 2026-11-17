import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Pager } from './Pager';

describe('Pager', () => {
  it('shows the range and calls back', async () => {
    const onPrevious = vi.fn<() => void>();
    const onNext = vi.fn<() => void>();
    render(
      <Pager
        rangeLabel="26–50 of 1,234"
        hasPrevious
        hasNext
        onPrevious={onPrevious}
        onNext={onNext}
      />,
    );
    expect(screen.getByText('26–50 of 1,234')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await userEvent.click(screen.getByRole('button', { name: 'Previous' }));
    expect(onNext).toHaveBeenCalledOnce();
    expect(onPrevious).toHaveBeenCalledOnce();
  });

  it('disables Previous and Next at the ends and says when updating', () => {
    render(
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
