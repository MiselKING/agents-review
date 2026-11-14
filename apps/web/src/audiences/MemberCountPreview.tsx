import type { AudienceFilterInput } from '../gql/graphql';
import { usePreviewCount } from './api';
import { useDebouncedValue } from './useDebouncedValue';

const PREVIEW_DELAY_MS = 400;

/** Live member count for the filter being edited, refreshed shortly after each change. */
export function MemberCountPreview({ filter }: { filter: AudienceFilterInput | null }) {
  const debounced = useDebouncedValue(filter, PREVIEW_DELAY_MS);
  // Query keys compare by content, so a new but equal filter object doesn't refetch.
  const preview = usePreviewCount(debounced);
  const waiting = JSON.stringify(filter) !== JSON.stringify(debounced) || preview.isFetching;

  let content: React.ReactNode;
  if (filter === null) {
    content = <span className="text-slate-500">Complete the conditions to see a count.</span>;
  } else if (preview.isError && !waiting) {
    content = <span className="text-red-700">The count could not be loaded.</span>;
  } else if (preview.data === undefined) {
    content = <span className="text-slate-500">Counting…</span>;
  } else {
    content = (
      <>
        <span className="text-2xl font-semibold text-slate-900 tabular-nums">
          {preview.data.toLocaleString('en')}
        </span>{' '}
        <span className="text-slate-600">matching customers</span>
        {waiting ? <span className="ml-2 text-xs text-slate-500">Updating…</span> : null}
      </>
    );
  }

  return (
    <output
      aria-live="polite"
      aria-busy={filter !== null && waiting}
      className="block rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm"
    >
      {content}
    </output>
  );
}
