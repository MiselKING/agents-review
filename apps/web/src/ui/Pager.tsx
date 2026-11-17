import { Button } from './Button';

interface PagerProps {
  /** What the page shows, like "26–50 of 1,234". */
  rangeLabel: string;
  hasPrevious: boolean;
  hasNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
  isUpdating?: boolean;
}

export function Pager({
  rangeLabel,
  hasPrevious,
  hasNext,
  onPrevious,
  onNext,
  isUpdating = false,
}: PagerProps) {
  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-4">
      <p aria-live="polite" className="text-sm text-slate-600 tabular-nums">
        {rangeLabel}
        {isUpdating ? <span className="ml-2 text-slate-500">Updating…</span> : null}
      </p>
      <div className="flex gap-2">
        <Button variant="secondary" disabled={!hasPrevious} onClick={onPrevious}>
          Previous
        </Button>
        <Button variant="secondary" disabled={!hasNext} onClick={onNext}>
          Next
        </Button>
      </div>
    </nav>
  );
}
