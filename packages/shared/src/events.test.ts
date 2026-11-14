import { describe, expect, it } from 'vitest';

import { findEventPropertiesError, isEventType } from './events.ts';

describe('isEventType', () => {
  it('accepts the known types only', () => {
    expect(isEventType('purchase')).toBe(true);
    expect(isEventType('page_view')).toBe(true);
    expect(isEventType('refund')).toBe(false);
  });
});

describe('findEventPropertiesError', () => {
  it('accepts valid properties for each type', () => {
    expect(findEventPropertiesError('purchase', { amount_cents: 1999 })).toBeUndefined();
    expect(findEventPropertiesError('page_view', { page_path: '/pricing' })).toBeUndefined();
  });

  it('rejects an unknown type', () => {
    expect(findEventPropertiesError('refund', {})).toMatch(/Unknown event type "refund"/);
  });

  it('rejects properties that are not an object', () => {
    expect(findEventPropertiesError('purchase', null)).toMatch(/must be an object/);
    expect(findEventPropertiesError('purchase', [1])).toMatch(/must be an object/);
  });

  it('rejects a purchase without a whole, non-negative amount', () => {
    expect(findEventPropertiesError('purchase', {})).toMatch(/amount_cents/);
    expect(findEventPropertiesError('purchase', { amount_cents: 9.5 })).toMatch(/amount_cents/);
    expect(findEventPropertiesError('purchase', { amount_cents: -1 })).toMatch(/amount_cents/);
  });

  it('rejects a page view without a path', () => {
    expect(findEventPropertiesError('page_view', {})).toMatch(/page_path/);
    expect(findEventPropertiesError('page_view', { page_path: 'pricing' })).toMatch(/page_path/);
  });
});
