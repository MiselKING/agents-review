import { useRef } from 'react';
import { Link } from 'react-router';

import { GraphQLRequestError } from '../graphql/execute';
import { useStartSync } from '../runs/api';
import { Button } from '../ui/Button';

const historyLink = (
  <Link to="/runs" className="font-medium text-indigo-700 hover:underline">
    View run history
  </Link>
);

export function SyncNowButton({ id, name }: { id: string; name: string }) {
  const sync = useStartSync();
  // Two clicks can land before React disables the button.
  const inFlight = useRef(false);

  const start = () => {
    if (inFlight.current) return;
    inFlight.current = true;
    sync.mutate(id, {
      onSettled: () => {
        inFlight.current = false;
      },
    });
  };

  const inProgress =
    sync.error instanceof GraphQLRequestError && sync.error.codes.includes('SYNC_IN_PROGRESS');

  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant="ghost" disabled={sync.isPending} onClick={start}>
        {sync.isPending ? (
          'Starting…'
        ) : (
          <>
            Sync now <span className="sr-only">{name}</span>
          </>
        )}
      </Button>
      {sync.isPending ? <span className="sr-only">Starting the sync of {name}</span> : null}
      <output className="block text-xs text-slate-600">
        {sync.isSuccess ? <p>Sync started. {historyLink}</p> : null}
        {inProgress && sync.error ? (
          <p>
            {sync.error.message} {historyLink}
          </p>
        ) : null}
      </output>
      {sync.isError && !inProgress ? (
        <p role="alert" className="text-xs text-red-700">
          Could not start the sync: {sync.error.message}
        </p>
      ) : null}
    </div>
  );
}
