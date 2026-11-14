import { findEventPropertiesError } from '@agents-review/shared/events';
import { describe, expect, it } from 'vitest';

import {
  generateSeedData,
  SEED_CUSTOMER_COUNT,
  SEED_EVENT_WINDOW_DAYS,
  SEED_PAGE_VIEW_COUNT,
  SEED_PURCHASE_COUNT,
} from './seed-data.ts';

const now = new Date('2026-11-14T15:30:00Z');
const data = generateSeedData(now);

describe('generateSeedData', () => {
  it('builds about 10,000 customers and 90,000 events', () => {
    expect(data.customers).toHaveLength(SEED_CUSTOMER_COUNT);
    expect(data.events.filter((event) => event.type === 'purchase')).toHaveLength(
      SEED_PURCHASE_COUNT,
    );
    expect(data.events.filter((event) => event.type === 'page_view')).toHaveLength(
      SEED_PAGE_VIEW_COUNT,
    );
  });

  it('gives the same data for any time on the same day', () => {
    expect(generateSeedData(new Date('2026-11-14T00:00:00Z'))).toEqual(data);
    expect(generateSeedData(new Date('2026-11-14T23:59:59Z'))).toEqual(data);
  });

  it('moves event dates with the day the seed runs', () => {
    const nextDay = generateSeedData(new Date('2026-11-15T15:30:00Z'));
    expect(nextDay.events[0]?.occurredAt).not.toEqual(data.events[0]?.occurredAt);
    expect(nextDay.customers.map((customer) => customer.email)).toEqual(
      data.customers.map((customer) => customer.email),
    );
  });

  it('keeps every event within the 180 days before the seed ran', () => {
    const earliest = now.getTime() - SEED_EVENT_WINDOW_DAYS * 24 * 60 * 60 * 1000;
    for (const event of data.events) {
      expect(event.occurredAt.getTime()).toBeGreaterThanOrEqual(earliest);
      expect(event.occurredAt.getTime()).toBeLessThanOrEqual(now.getTime());
    }
  });

  it('uses only event types and properties that the shared rules accept', () => {
    const errors = data.events
      .map((event) => findEventPropertiesError(event.type, event.properties))
      .filter((error) => error !== undefined);
    expect(errors).toEqual([]);
  });

  it('points every event at an existing customer', () => {
    for (const event of data.events) {
      expect(data.customers[event.customerIndex]).toBeDefined();
    }
  });

  it('spreads customers over 10 three-letter countries', () => {
    const countries = new Set(data.customers.map((customer) => customer.country));
    expect(countries.size).toBe(10);
    for (const country of countries) expect(country).toMatch(/^[A-Z]{3}$/);
  });

  it('gives every customer a unique lowercase email', () => {
    const emails = data.customers.map((customer) => customer.email);
    expect(new Set(emails).size).toBe(emails.length);
    expect(emails.every((email) => email === email.toLowerCase())).toBe(true);
  });
});
