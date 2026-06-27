import type { ProviderCredentials } from '@hem/core/connector';
import { Redacted } from 'effect';

/**
 * Provider credentials with secret fields wrapped for in-process handling.
 */
export interface RedactedProviderCredentials {
	readonly accessToken: Redacted.Redacted<string>;
	readonly expiresAt?: string | null;
	readonly refreshToken: Redacted.Redacted<string> | null;
	readonly scope?: string | null;
	readonly teamId?: string | null;
	readonly tokenType?: string | null;
}

/**
 * Wraps persisted credentials so tokens are not logged accidentally.
 */
export const redactProviderCredentials = (
	credentials: ProviderCredentials
): RedactedProviderCredentials => ({
	accessToken: Redacted.make(credentials.accessToken),
	expiresAt: credentials.expiresAt ?? null,
	refreshToken: credentials.refreshToken
		? Redacted.make(credentials.refreshToken)
		: null,
	scope: credentials.scope ?? null,
	teamId: credentials.teamId ?? null,
	tokenType: credentials.tokenType ?? null,
});

/**
 * Projects redacted credentials into the persistence record shape.
 */
export const persistProviderCredentials = (
	credentials: RedactedProviderCredentials
): ProviderCredentials => ({
	accessToken: Redacted.value(credentials.accessToken),
	expiresAt: credentials.expiresAt ?? null,
	refreshToken: credentials.refreshToken
		? Redacted.value(credentials.refreshToken)
		: null,
	scope: credentials.scope ?? null,
	teamId: credentials.teamId ?? null,
	tokenType: credentials.tokenType ?? null,
});