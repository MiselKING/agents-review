import type { SyncRunStatus } from '../gql/graphql';

const labels: Record<SyncRunStatus, string> = {
  QUEUED: 'Queued',
  RUNNING: 'Running',
  SUCCEEDED: 'Succeeded',
  FAILED: 'Failed',
};

export const statusLabel = (status: SyncRunStatus) => labels[status];

export const isFinished = (status: SyncRunStatus) => status === 'SUCCEEDED' || status === 'FAILED';

const dateTimeFormat = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' });

export const formatDateTime = (iso: string) => dateTimeFormat.format(new Date(iso));

/** Like "850 ms", "42 s", "3 min 5 s" or "1 h 2 min". */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.max(0, Math.round(ms))} ms`;
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    const rest = seconds % 60;
    return rest ? `${minutes} min ${rest} s` : `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  return restMinutes ? `${hours} h ${restMinutes} min` : `${hours} h`;
}
