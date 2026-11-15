import { Link } from 'react-router';

import { ButtonLink } from '../ui/Button';
import { ErrorState, LoadingState } from '../ui/states';
import { useAudiences } from './api';
import { ArchiveAudienceButton } from './ArchiveAudienceButton';

const dateFormat = new Intl.DateTimeFormat('en', { dateStyle: 'medium' });

export function AudienceListPage() {
  const audiences = useAudiences();

  let content: React.ReactNode;
  if (audiences.isPending) {
    content = <LoadingState label="Loading audiences…" />;
  } else if (audiences.isError) {
    content = <ErrorState title="Audiences could not be loaded." error={audiences.error} />;
  } else if (audiences.data.length === 0) {
    content = (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
        <h2 className="text-base font-semibold text-slate-900">No audiences yet</h2>
        <p className="mt-1 text-sm text-slate-600">
          Group customers by country, signup date or activity.
        </p>
        <ButtonLink to="/audiences/new" variant="primary" className="mt-6">
          Create your first audience
        </ButtonLink>
      </div>
    );
  } else {
    content = (
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Audiences</caption>
          <thead className="border-b border-slate-200 bg-slate-50 text-xs font-medium tracking-wide text-slate-500 uppercase">
            <tr>
              <th scope="col" className="px-4 py-3">
                Name
              </th>
              <th scope="col" className="px-4 py-3 text-right">
                Members
              </th>
              <th scope="col" className="px-4 py-3">
                Created
              </th>
              <th scope="col" className="px-4 py-3">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {audiences.data.map((audience) => (
              <tr key={audience.id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <Link
                    to={`/audiences/${audience.id}`}
                    className="font-medium text-indigo-700 hover:underline"
                  >
                    {audience.name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-right text-slate-700 tabular-nums">
                  {audience.memberCount.toLocaleString('en')}
                </td>
                <td className="px-4 py-3 text-slate-600">
                  <time dateTime={audience.createdAt}>
                    {dateFormat.format(new Date(audience.createdAt))}
                  </time>
                </td>
                <td className="px-4 py-3 text-right">
                  <ArchiveAudienceButton id={audience.id} name={audience.name} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <section className="space-y-6">
      <title>Audiences · Agents-Driven Flow</title>
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Audiences</h1>
        <ButtonLink to="/audiences/new" variant="primary">
          New audience
        </ButtonLink>
      </div>
      {content}
    </section>
  );
}
