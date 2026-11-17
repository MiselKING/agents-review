import { useState } from 'react';
import { useParams } from 'react-router';

import { ButtonLink } from '../ui/Button';
import { Pager } from '../ui/Pager';
import {
  ErrorState,
  LoadingState,
  PageMessage,
  RefreshFailedNote,
  TryAgainButton,
} from '../ui/states';
import {
  countryLabel,
  MEMBERS_PAGE_SIZE,
  useAudienceMembers,
  useAudienceSummary,
  useCountries,
} from './api';

export function AudienceMembersPage() {
  const { id = '' } = useParams();
  // Keyed so the visited cursors reset when another audience opens.
  return <MembersView key={id} id={id} />;
}

function MembersView({ id }: { id: string }) {
  // Cursors of the pages visited; the last one is the current page, null the first.
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  const pageIndex = cursors.length - 1;
  const summary = useAudienceSummary(id);
  const members = useAudienceMembers(id, cursors[pageIndex] ?? null);
  const countries = useCountries();
  const goBack = () => setCursors((list) => list.slice(0, -1));

  if (summary.isError && summary.data === undefined) {
    const retry = () => {
      void summary.refetch();
      if (members.isError) void members.refetch();
    };
    return (
      <ErrorState
        title="The members could not be loaded."
        error={summary.error}
        action={<TryAgainButton onClick={retry} />}
      />
    );
  }
  if (summary.isPending || members.isPending) {
    return <LoadingState label="Loading members…" />;
  }
  const membersFailed = members.isError && members.data === undefined;
  if (!summary.data || (!membersFailed && !members.data)) {
    return (
      <PageMessage title="Audience not found" link={{ to: '/', label: 'Back to audiences' }}>
        This audience doesn’t exist or was archived.
      </PageMessage>
    );
  }

  const { name, memberCount } = summary.data;
  const nodes = members.data?.members.nodes ?? [];
  const pageInfo = members.data?.members.pageInfo;
  const isUpdating = members.isPlaceholderData;
  const failedRefresh = [summary, members].find((query) => query.isError && query.data);
  const retryMembers = () => void members.refetch();
  const countryNames = new Map(
    (countries.data ?? []).map((country) => [country.code, countryLabel(country)]),
  );
  const start = pageIndex * MEMBERS_PAGE_SIZE + 1;
  // The shown rows are the previous page's while updating, so no range fits them yet.
  const rangeLabel = isUpdating
    ? ''
    : nodes.length === 0
      ? 'No more members'
      : `${start.toLocaleString('en')}–${(start + nodes.length - 1).toLocaleString('en')} of ${memberCount.toLocaleString('en')}`;

  return (
    <section className="space-y-6">
      <title>{`${name} members · Agents-Driven Flow`}</title>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{name}</h1>
          <p className="mt-1 text-sm text-slate-600">
            {memberCount.toLocaleString('en')} customers match now
          </p>
        </div>
        <ButtonLink to={`/audiences/${id}`} variant="secondary">
          Edit audience
        </ButtonLink>
      </div>

      {failedRefresh ? (
        <RefreshFailedNote
          what="members"
          updatedAt={failedRefresh.dataUpdatedAt}
          onRetry={() => {
            if (summary.isError) void summary.refetch();
            if (members.isError) void members.refetch();
          }}
        />
      ) : null}

      {membersFailed ? (
        <MembersLoadError
          pageIndex={pageIndex}
          error={members.error}
          onRetry={retryMembers}
          onPrevious={goBack}
        />
      ) : nodes.length === 0 && pageIndex === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
          <h2 className="text-base font-semibold text-slate-900">No customers match</h2>
          <p className="mt-1 text-sm text-slate-600">No customers match this audience’s filter.</p>
          <ButtonLink to={`/audiences/${id}`} variant="primary" className="mt-6">
            Edit audience
          </ButtonLink>
        </div>
      ) : (
        <>
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <table
              aria-busy={isUpdating}
              className={`w-full text-left text-sm ${isUpdating ? 'opacity-60' : ''}`}
            >
              <caption className="sr-only">Members of {name}</caption>
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-medium tracking-wide text-slate-500 uppercase">
                <tr>
                  <th scope="col" className="px-4 py-3">
                    Name
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Email
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Country
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {nodes.map((member) => (
                  <tr key={member.id}>
                    <td className="px-4 py-3">
                      {member.firstName} {member.lastName}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{member.email}</td>
                    <td className="px-4 py-3 text-slate-700">
                      {countryNames.get(member.country) ?? member.country}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager
            rangeLabel={rangeLabel}
            hasPrevious={pageIndex > 0}
            hasNext={(pageInfo?.hasNextPage ?? false) && !isUpdating}
            isUpdating={isUpdating}
            onPrevious={goBack}
            onNext={() => setCursors((list) => [...list, pageInfo?.endCursor ?? null])}
          />
        </>
      )}
    </section>
  );
}

function MembersLoadError({
  pageIndex,
  error,
  onRetry,
  onPrevious,
}: {
  pageIndex: number;
  error: unknown;
  onRetry: () => void;
  onPrevious: () => void;
}) {
  const retry = <TryAgainButton onClick={onRetry} />;
  if (pageIndex === 0) {
    return <ErrorState title="The members could not be loaded." error={error} action={retry} />;
  }
  const first = pageIndex * MEMBERS_PAGE_SIZE + 1;
  const last = first + MEMBERS_PAGE_SIZE - 1;
  return (
    <>
      <ErrorState
        title={`Members ${first.toLocaleString('en')}–${last.toLocaleString('en')} couldn't be loaded.`}
        error={error}
        action={retry}
      />
      <Pager
        rangeLabel=""
        hasPrevious
        hasNext={false}
        onPrevious={onPrevious}
        onNext={() => undefined}
      />
    </>
  );
}
