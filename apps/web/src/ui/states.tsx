import type { ReactNode } from 'react';

import { ButtonLink } from './Button';

export function LoadingState({ label }: { label: string }) {
  return <output className="block py-12 text-center text-sm text-slate-500">{label}</output>;
}

export function ErrorState({ title, error }: { title: string; error: unknown }) {
  const detail = error instanceof Error ? error.message : 'Unknown error.';
  return (
    <div
      role="alert"
      className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800"
    >
      <p className="font-medium">{title}</p>
      <p className="mt-1 text-red-700">{detail}</p>
    </div>
  );
}

export function NotFoundState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="py-16 text-center">
      <title>{`${title} · Agents-Driven Flow`}</title>
      <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
      {children ? <p className="mt-2 text-sm text-slate-600">{children}</p> : null}
      <ButtonLink to="/" variant="secondary" className="mt-6">
        Back to audiences
      </ButtonLink>
    </div>
  );
}
