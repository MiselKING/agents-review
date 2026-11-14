import { AlertDialog } from '@base-ui/react/alert-dialog';
import { useState } from 'react';

import { Button, buttonClasses } from '../ui/Button';
import { useArchiveAudience } from './api';

export function ArchiveAudienceButton({ id, name }: { id: string; name: string }) {
  const [open, setOpen] = useState(false);
  const archive = useArchiveAudience();

  return (
    <AlertDialog.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) archive.reset();
      }}
    >
      <AlertDialog.Trigger
        className={buttonClasses('ghost', 'text-red-700 hover:text-red-800')}
        aria-label={`Archive ${name}`}
      >
        Archive
      </AlertDialog.Trigger>
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className="fixed inset-0 bg-slate-900/30 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0" />
        <AlertDialog.Popup className="fixed top-1/2 left-1/2 w-96 max-w-[calc(100vw-3rem)] -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-6 shadow-xl transition-[scale,opacity] duration-150 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0">
          <AlertDialog.Title className="text-base font-semibold text-slate-900">
            Archive “{name}”?
          </AlertDialog.Title>
          <AlertDialog.Description className="mt-2 text-sm text-slate-600">
            It disappears from the list. Its sync history is kept.
          </AlertDialog.Description>
          {archive.error ? (
            <p role="alert" className="mt-3 text-sm text-red-700">
              Could not archive: {archive.error.message}
            </p>
          ) : null}
          <div className="mt-6 flex justify-end gap-3">
            <AlertDialog.Close className={buttonClasses('secondary')}>Cancel</AlertDialog.Close>
            <Button
              variant="danger"
              disabled={archive.isPending}
              onClick={() => archive.mutate(id, { onSuccess: () => setOpen(false) })}
            >
              {archive.isPending ? 'Archiving…' : 'Archive'}
            </Button>
          </div>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
