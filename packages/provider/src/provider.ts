import type { Effect } from 'effect';
import { Data } from 'effect';

import type { Provider as ProviderName } from './index';

export interface Token {
	readonly id: string;
	readonly name: string;
	readonly value?: string;
	readonly issuedOn?: string;
	readonly expiresOn?: string;
	readonly notBefore?: string;
}

/**
 * Provider-agnostic failures. Every concrete provider maps its own SDK/HTTP
 * errors onto one of these, so the CLI handles a single, stable set regardless
 * of which provider produced the failure. The `cause` carries the original
 * provider error for debugging.
 */

/** Credentials were rejected — bad token or missing scope (e.g. 401/403). */
export class ProviderAuthError extends Data.TaggedError('ProviderAuthError')<{
	readonly provider: ProviderName;
	readonly message: string;
	readonly cause?: unknown;
}> {}

/** The provider rate-limited the request (e.g. 429). */
export class ProviderRateLimitError extends Data.TaggedError(
	'ProviderRateLimitError'
)<{
	readonly provider: ProviderName;
	readonly message: string;
	readonly cause?: unknown;
}> {}

/** The provider failed on its side or is temporarily unavailable (e.g. 5xx). */
export class ProviderUnavailableError extends Data.TaggedError(
	'ProviderUnavailableError'
)<{
	readonly provider: ProviderName;
	readonly message: string;
	readonly cause?: unknown;
}> {}

/** Our request was rejected as invalid — bad input, unknown permission, etc. */
export class ProviderRequestError extends Data.TaggedError(
	'ProviderRequestError'
)<{
	readonly provider: ProviderName;
	readonly message: string;
	readonly cause?: unknown;
}> {}

/** The provider's response was missing data or could not be understood. */
export class ProviderResponseError extends Data.TaggedError(
	'ProviderResponseError'
)<{
	readonly provider: ProviderName;
	readonly message: string;
	readonly cause?: unknown;
}> {}

export type ProviderError =
	| ProviderAuthError
	| ProviderRateLimitError
	| ProviderUnavailableError
	| ProviderRequestError
	| ProviderResponseError;

export interface Provider {
	readonly mint: () => Effect.Effect<Token, ProviderError>;
}
