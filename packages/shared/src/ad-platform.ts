// The contract of the ad platform's `POST /audiences/:id/members`, shared by the sync worker
// that sends batches and the mock platform that receives them.

export const MAX_MEMBERS_PER_BATCH = 500;
export const MAX_MEMBER_ID_LENGTH = 64;
export const MAX_MEMBER_EMAIL_LENGTH = 254;

export const IDEMPOTENCY_KEY_HEADER = 'idempotency-key';
export const MAX_IDEMPOTENCY_KEY_LENGTH = 255;

/** The answer when an idempotency key comes back with a different batch than its first use. */
export const IDEMPOTENCY_CONFLICT_STATUS = 422;

export interface PlatformMember {
  id: string;
  email: string;
}

/** Whether the platform accepts this email address. */
export const isAcceptedEmail = (email: string) =>
  email.length <= MAX_MEMBER_EMAIL_LENGTH && /^[^@\s]+@[^@\s]+$/.test(email);
