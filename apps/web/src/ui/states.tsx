import type { ReactNode } from 'react';

import { Button, ButtonLink } from './Button';

export function LoadingState({ label }: { label: string }) {
  return <output className="block py-12 text-center text-sm text-slate-500">{label}</output>;
}

export function TryAgainButton({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="secondary" onClick={onClick}>
      Try again
    </Button>
  );
}

const timeFormat = new Intl.DateTimeFormat('en', {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** Shown above rows that are still on screen after a refresh failed. */
export function RefreshFailedNote({
  what,
  updatedAt,
  onRetry,
}: {
  what: string;
  updatedAt: number;
  onRetry: () => void;
}) {
  return (
    <output className="flex items-center justify-between gap-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
      <span>{`Couldn't refresh. Showing ${what} as of ${timeFormat.format(updatedAt)}.`}</span>
      <TryAgainButton onClick={onRetry} />
    </output>
  );
}

export function ErrorState({
  title,
  error,
  action,
}: {
  title: string;
  error: unknown;
  action?: ReactNode;
}) {
  const detail = error instanceof Error ? error.message : 'Unknown error.';
  return (
    <div
      role="alert"
      className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800"
    >
      <p className="font-medium">{title}</p>
      <p className="mt-1 text-red-700">{detail}</p>
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

/** A full-page message, like "not found", with one link to go on from there. */
export function PageMessage({
  title,
  children,
  link,
}: {
  title: string;
  children?: ReactNode;
  link: { to: string; label: string };
}) {
  return (
    <div className="py-16 text-center">
      <title>{`${title} · Agents-Driven Flow`}</title>
      <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
      {children ? <p className="mt-2 text-sm text-slate-600">{children}</p> : null}
      <ButtonLink to={link.to} variant="secondary" className="mt-6">
        {link.label}
      </ButtonLink>
    </div>
  );
}
