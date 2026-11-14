import type { EventProperties, EventType } from '@agents-review/shared/events';

export const SEED_CUSTOMER_COUNT = 10_000;
export const SEED_PURCHASE_COUNT = 20_000;
export const SEED_PAGE_VIEW_COUNT = 70_000;
export const SEED_EVENT_WINDOW_DAYS = 180;

const DAY_MS = 24 * 60 * 60 * 1000;

// [ISO 3166-1 alpha-3 code, share of customers]
const COUNTRIES: readonly (readonly [string, number])[] = [
  ['DEU', 0.22],
  ['USA', 0.2],
  ['GBR', 0.12],
  ['FRA', 0.1],
  ['ESP', 0.08],
  ['ITA', 0.08],
  ['NLD', 0.06],
  ['POL', 0.06],
  ['SWE', 0.04],
  ['CAN', 0.04],
];

const FIRST_NAMES = [
  'Anna',
  'Ben',
  'Clara',
  'David',
  'Elena',
  'Felix',
  'Greta',
  'Hugo',
  'Ines',
  'Jonas',
  'Klara',
  'Luca',
  'Mia',
  'Noah',
  'Olivia',
  'Paul',
  'Rosa',
  'Sam',
  'Tessa',
  'Viktor',
];

const LAST_NAMES = [
  'Bauer',
  'Carter',
  'Dubois',
  'Evans',
  'Fischer',
  'Garcia',
  'Hansen',
  'Ivanov',
  'Jansen',
  'Kowalski',
  'Lindqvist',
  'Martin',
  'Novak',
  'Olsen',
  'Peters',
  'Ricci',
  'Schmidt',
  'Taylor',
  'Vogel',
  'Weber',
];

const PAGE_PATHS = [
  '/',
  '/pricing',
  '/products',
  '/products/shoes',
  '/products/jackets',
  '/blog',
  '/cart',
  '/checkout',
  '/account',
];

export interface SeedCustomer {
  email: string;
  firstName: string;
  lastName: string;
  country: string;
  createdAt: Date;
}

export interface SeedEvent {
  /** Position of the customer in `customers`; the database assigns the real id. */
  customerIndex: number;
  type: EventType;
  occurredAt: Date;
  properties: EventProperties;
}

export interface SeedData {
  customers: SeedCustomer[];
  events: SeedEvent[];
}

// Mulberry32: a small PRNG, so the same seed gives the same rows on every machine.
function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d_2b_79_f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function pick<T>(list: readonly T[], random: () => number): T {
  const item = list[Math.floor(random() * list.length)];
  if (item === undefined) throw new Error('Cannot pick from an empty list.');
  return item;
}

function pickCountry(random: () => number): string {
  let remaining = random();
  for (const [code, share] of COUNTRIES) {
    remaining -= share;
    if (remaining < 0) return code;
  }
  return pick(COUNTRIES, random)[0];
}

/**
 * Builds the seed rows. Dates are relative to the start of `now`'s UTC day, so every
 * run on the same day gives the same data and "last 30 days" filters always match.
 */
export function generateSeedData(now: Date): SeedData {
  const random = createRandom(20_261_114);
  const anchor = Math.floor(now.getTime() / DAY_MS) * DAY_MS;

  const customers: SeedCustomer[] = [];
  for (let index = 0; index < SEED_CUSTOMER_COUNT; index += 1) {
    const firstName = pick(FIRST_NAMES, random);
    const lastName = pick(LAST_NAMES, random);
    // Signed up before the event window, so no event is older than its customer.
    const signedUpDaysAgo = SEED_EVENT_WINDOW_DAYS + 1 + Math.floor(random() * 550);
    customers.push({
      email: `${firstName}.${lastName}.${index + 1}@example.com`.toLowerCase(),
      firstName,
      lastName,
      country: pickCountry(random),
      createdAt: new Date(anchor - signedUpDaysAgo * DAY_MS),
    });
  }

  // Squaring skews activity: a few customers have many events and many have none.
  const pickCustomerIndex = () => Math.floor(random() ** 2 * SEED_CUSTOMER_COUNT);
  // One day short of the window: the anchor is up to a day before the seed runs.
  const spreadMs = (SEED_EVENT_WINDOW_DAYS - 1) * DAY_MS;
  const pickOccurredAt = () => new Date(anchor - Math.floor(random() * spreadMs));

  const events: SeedEvent[] = [];
  for (let index = 0; index < SEED_PURCHASE_COUNT; index += 1) {
    events.push({
      customerIndex: pickCustomerIndex(),
      type: 'purchase',
      occurredAt: pickOccurredAt(),
      properties: { amount_cents: 500 + Math.floor(random() * 24_500) },
    });
  }
  for (let index = 0; index < SEED_PAGE_VIEW_COUNT; index += 1) {
    events.push({
      customerIndex: pickCustomerIndex(),
      type: 'page_view',
      occurredAt: pickOccurredAt(),
      properties: { page_path: pick(PAGE_PATHS, random) },
    });
  }

  return { customers, events };
}
