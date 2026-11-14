import { parseAudienceFilter } from '@agents-review/shared/audience-filter';
import { describe, expect, it } from 'vitest';

import { SAMPLE_AUDIENCES } from './sample-audiences.ts';

describe('SAMPLE_AUDIENCES', () => {
  it.each(SAMPLE_AUDIENCES.map((audience) => [audience.name, audience.definition]))(
    '"%s" passes the filter validation',
    (_name, definition) => {
      expect(parseAudienceFilter(definition)).toEqual({ ok: true, value: definition });
    },
  );
});
