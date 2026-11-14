import type { Queryable } from '@agents-review/db';
import type { AudienceFilter } from '@agents-review/shared/audience-filter';

export interface ApiContext {
  db: Queryable;
  /** One moment per request, so a count and a page of members agree. */
  now: Date;
}

/** What `previewAudience` hands to the AudiencePreview field resolvers. */
export interface PreviewParent {
  filter: AudienceFilter;
  page: { first: number; after?: number };
}
