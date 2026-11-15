export const MAX_BATCH_SIZE = 500;
const MAX_ID_LENGTH = 64;
const MAX_EMAIL_LENGTH = 254;

export interface Member {
  id: string;
  email: string;
}

export type BatchResult = { ok: true; members: Member[] } | { ok: false; error: string };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function memberError(raw: unknown, index: number): string | undefined {
  const path = `members[${index}]`;
  if (!isRecord(raw)) return `${path} must be an object with id and email.`;
  const { id, email } = raw;
  if (typeof id !== 'string' || id.length === 0 || id.length > MAX_ID_LENGTH) {
    return `${path}.id must be a string of 1 to ${MAX_ID_LENGTH} characters.`;
  }
  if (
    typeof email !== 'string' ||
    email.length > MAX_EMAIL_LENGTH ||
    !/^[^@\s]+@[^@\s]+$/.test(email)
  ) {
    return `${path}.email must be an email address.`;
  }
  return undefined;
}

/** Checks a parsed request body; `{ members: [{ id, email }] }` with 1 to 500 members. */
export function parseBatch(body: unknown): BatchResult {
  if (!isRecord(body) || !Array.isArray(body.members)) {
    return { ok: false, error: 'Body must be an object with a members list.' };
  }
  const raw: unknown[] = body.members;
  if (raw.length === 0 || raw.length > MAX_BATCH_SIZE) {
    return {
      ok: false,
      error: `members must have 1 to ${MAX_BATCH_SIZE} entries, got ${raw.length}.`,
    };
  }
  const members: Member[] = [];
  for (const [index, item] of raw.entries()) {
    const error = memberError(item, index);
    if (error) return { ok: false, error };
    if (isRecord(item) && typeof item.id === 'string' && typeof item.email === 'string') {
      members.push({ id: item.id, email: item.email });
    }
  }
  return { ok: true, members };
}
