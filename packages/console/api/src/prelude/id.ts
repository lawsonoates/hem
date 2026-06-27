import { Effect } from 'effect';

/**
 * Generates a random UUID for installation state and fallback identifiers.
 */
export const randomUuid = Effect.sync(() => crypto.randomUUID());