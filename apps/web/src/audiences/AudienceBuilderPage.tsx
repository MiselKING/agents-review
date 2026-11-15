import { useNavigate, useParams } from 'react-router';

import { ErrorState, LoadingState, PageMessage } from '../ui/states';
import { useAudience, useCreateAudience, useUpdateAudience } from './api';
import { formStateFromAudience, emptyFormState } from './audience-form-state';
import { AudienceForm } from './AudienceForm';

function PageHeading({ title }: { title: string }) {
  return (
    <>
      <title>{`${title} · Agents-Driven Flow`}</title>
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
    </>
  );
}

export function NewAudiencePage() {
  const navigate = useNavigate();
  const create = useCreateAudience();

  return (
    <section className="space-y-6">
      <PageHeading title="New audience" />
      <AudienceForm
        initial={emptyFormState()}
        submitLabel="Create audience"
        isSaving={create.isPending}
        saveError={create.error}
        onSave={(values) => create.mutate(values, { onSuccess: () => void navigate('/') })}
      />
    </section>
  );
}

export function EditAudiencePage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const audience = useAudience(id);
  const update = useUpdateAudience(id);

  if (audience.isPending) return <LoadingState label="Loading audience…" />;
  if (audience.isError)
    return <ErrorState title="The audience could not be loaded." error={audience.error} />;
  if (!audience.data) {
    return (
      <PageMessage title="Audience not found" link={{ to: '/', label: 'Back to audiences' }}>
        It may have been archived, or the address is wrong.
      </PageMessage>
    );
  }

  return (
    <section className="space-y-6">
      <PageHeading title={`Edit ${audience.data.name}`} />
      <AudienceForm
        // Start from the saved audience again if another audience is opened.
        key={audience.data.id}
        initial={formStateFromAudience(audience.data)}
        submitLabel="Save changes"
        isSaving={update.isPending}
        saveError={update.error}
        onSave={(values) => update.mutate(values, { onSuccess: () => void navigate('/') })}
      />
    </section>
  );
}
