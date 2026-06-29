import type { ProviderCredentials } from '@hem/core/connector';
import { CONNECTOR_DEFAULT_OUTPUTS } from '@hem/core/connector';
import type { ManagedConnector, OAuthConnector } from '@hem/core/connector';
import type { Schema } from 'effect';
import { Clock, Config, Effect, Option, Redacted } from 'effect';
import { HttpClient, HttpClientResponse } from 'effect/unstable/http';
import type { HttpClientRequest } from 'effect/unstable/http';

import { ConnectorError } from './types';
import type { ConnectorCredentialLease } from './types';

const INSTALLATION_LEASE_MS = 60 * 60 * 1000;
const REFRESH_SKEW_MS = 60 * 1000;
type ServiceFreeSchema<A> = Schema.Top & {
	readonly DecodingServices: never;
	readonly Type: A;
};

const PROVIDER_PREFIXES = {
	notion: 'NOTION_OAUTH',
	planetscale: 'PLANETSCALE_OAUTH',
	slack: 'SLACK',
	vercel: 'VERCEL',
} as const satisfies Record<OAuthConnector, string>;

/**
 * Normalizes OAuth scope strings into granted permission records.
 */
export const permissionsFromScope = (
	scope: string | null | undefined
): Readonly<Record<string, string>> => (scope ? { scope } : {});

/**
 * Returns an ISO timestamp one lease window from the current clock reading.
 */
export const oneHourFromNow = Effect.gen(function* () {
	const now = yield* Clock.currentTimeMillis;
	return new Date(now + INSTALLATION_LEASE_MS).toISOString();
});

/**
 * Returns an ISO timestamp derived from a relative expiry in seconds.
 */
export const expiresAtFromSeconds = (seconds: number) =>
	Effect.gen(function* () {
		const now = yield* Clock.currentTimeMillis;
		return new Date(now + seconds * 1000).toISOString();
	});

/**
 * Builds the public OAuth callback URL for a managed connector.
 */
export const connectorCallbackUrl = (
	publicApiUrl: string,
	connector: ManagedConnector
) => new URL(`/v1/connectors/${connector}/callback`, publicApiUrl).toString();

export const optionalString = (key: string) =>
	Config.option(Config.string(key));

export const optionalStringWithDefault = (key: string, fallback: string) =>
	Effect.gen(function* () {
		const configured = yield* optionalString(key);
		return Option.getOrElse(configured, () => fallback);
	});

/**
 * Resolves the configured OAuth redirect URI for a connector.
 */
export const providerRedirectUri = (
	connector: OAuthConnector,
	publicApiUrl: string
) =>
	Effect.gen(function* () {
		const prefix = PROVIDER_PREFIXES[connector];
		return yield* optionalStringWithDefault(
			`${prefix}_REDIRECT_URI`,
			connectorCallbackUrl(publicApiUrl, connector)
		);
	});

/**
 * Loads OAuth client credentials for a connector from configuration.
 */
export const providerCredentials = (connector: OAuthConnector) =>
	Effect.gen(function* () {
		const prefix = PROVIDER_PREFIXES[connector];
		const clientId = yield* Config.string(`${prefix}_CLIENT_ID`).pipe(
			Effect.mapError(
				(cause) =>
					new ConnectorError({
						cause,
						connector,
						message: `${connector} OAuth client id is not configured.`,
					})
			)
		);
		const clientSecret = yield* Config.redacted(
			`${prefix}_CLIENT_SECRET`
		).pipe(
			Effect.map(Redacted.value),
			Effect.mapError(
				(cause) =>
					new ConnectorError({
						cause,
						connector,
						message: `${connector} OAuth client secret is not configured.`,
					})
			)
		);
		return { clientId, clientSecret } as const;
	});

/**
 * Executes a provider HTTP request and decodes the JSON body with a schema.
 */
export const readProviderSchema = <A>(input: {
	readonly client: HttpClient.HttpClient;
	readonly connector: OAuthConnector;
	readonly message: string;
	readonly request: HttpClientRequest.HttpClientRequest;
	readonly schema: ServiceFreeSchema<A>;
}) =>
	Effect.gen(function* () {
		const client = input.client.pipe(HttpClient.filterStatusOk);
		const response = yield* client.execute(input.request).pipe(
			Effect.mapError(
				(cause) =>
					new ConnectorError({
						cause,
						connector: input.connector,
						message: input.message,
					})
			)
		);
		return yield* HttpClientResponse.schemaBodyJson(input.schema)(
			response
		).pipe(
			Effect.mapError(
				(cause) =>
					new ConnectorError({
						cause,
						connector: input.connector,
						message: `${input.message} Provider returned an invalid response.`,
					})
			)
		);
	});

/**
 * Builds the persisted credential record shape from an OAuth token response.
 */
export const tokenCredentials = (input: {
	readonly accessToken: string;
	readonly expiresAt?: string | null;
	readonly refreshToken?: string | null;
	readonly scope?: string | null;
	readonly teamId?: string | null;
	readonly tokenType?: string | null;
}): ProviderCredentials => ({
	accessToken: input.accessToken,
	expiresAt: input.expiresAt ?? null,
	refreshToken: input.refreshToken ?? null,
	scope: input.scope ?? null,
	teamId: input.teamId ?? null,
	tokenType: input.tokenType ?? null,
});

/**
 * Issues or refreshes OAuth connector credentials for lease responses.
 */
export const issueOAuthCredential = (input: {
	readonly connector: OAuthConnector;
	readonly credentials: ProviderCredentials | null;
	readonly extraValues?: (
		credentials: ProviderCredentials
	) => Readonly<Record<string, string>>;
	readonly refresh?: (
		credentials: ProviderCredentials
	) => Effect.Effect<ProviderCredentials, ConnectorError>;
}) =>
	Effect.gen(function* () {
		if (!input.credentials) {
			return yield* new ConnectorError({
				connector: input.connector,
				message: `${input.connector} installation has no stored credentials.`,
			});
		}

		const now = yield* Clock.currentTimeMillis;
		const expiry = input.credentials.expiresAt
			? Date.parse(input.credentials.expiresAt)
			: undefined;
		const shouldRefresh =
			expiry !== undefined && expiry <= now + REFRESH_SKEW_MS;
		const credentials =
			input.refresh && shouldRefresh
				? yield* input.refresh(input.credentials)
				: input.credentials;

		const expiresAt = credentials.expiresAt ?? (yield* oneHourFromNow);
		if (Date.parse(expiresAt) <= now) {
			return yield* new ConnectorError({
				connector: input.connector,
				message: `${input.connector} OAuth token is expired.`,
			});
		}

		return {
			credentials:
				credentials === input.credentials ? undefined : credentials,
			expiresAt,
			grantedPermissions: credentials.scope
				? permissionsFromScope(credentials.scope)
				: undefined,
			values: {
				[CONNECTOR_DEFAULT_OUTPUTS[input.connector][0]]:
					credentials.accessToken,
				...input.extraValues?.(credentials),
			},
		} satisfies ConnectorCredentialLease;
	});

export const PublicApiUrl = Config.string('PUBLIC_API_URL').pipe(
	Config.withDefault('http://127.0.0.1:3000')
);
