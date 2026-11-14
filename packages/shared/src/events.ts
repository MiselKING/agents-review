export const EVENT_TYPES = ['purchase', 'page_view'] as const;

export type EventType = (typeof EVENT_TYPES)[number];

/** What `events.properties` holds for each event type. */
export interface EventPropertiesByType {
  purchase: { amount_cents: number };
  page_view: { page_path: string };
}

export type EventProperties = EventPropertiesByType[EventType];

export function isEventType(value: string): value is EventType {
  return (EVENT_TYPES as readonly string[]).includes(value);
}

/** Returns why `properties` is invalid for `type`, or undefined when it's valid. */
export function findEventPropertiesError(type: string, properties: unknown): string | undefined {
  if (!isEventType(type)) {
    return `Unknown event type "${type}". Allowed: ${EVENT_TYPES.join(', ')}.`;
  }
  if (typeof properties !== 'object' || properties === null || Array.isArray(properties)) {
    return 'Event properties must be an object.';
  }
  return PROPERTY_CHECKS[type](properties);
}

// A new event type fails to compile until it gets a check here.
const PROPERTY_CHECKS: Record<EventType, (properties: object) => string | undefined> = {
  purchase: (properties) => {
    const amount = 'amount_cents' in properties ? properties.amount_cents : undefined;
    return typeof amount === 'number' && Number.isInteger(amount) && amount >= 0
      ? undefined
      : 'A purchase needs amount_cents as a whole number of 0 or more.';
  },
  page_view: (properties) => {
    const path = 'page_path' in properties ? properties.page_path : undefined;
    return typeof path === 'string' && path.startsWith('/')
      ? undefined
      : 'A page_view needs page_path as a string starting with "/".';
  },
};
