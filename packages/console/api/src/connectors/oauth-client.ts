import type { ProviderCredentials } from '@hem/console-core/database/schema/installation';
import { CONNECTOR_DEFAULT_OUTPUTS } from '@hem/core/connector';
import type { ManagedConnector, OAuthConnector } from '@hem/core/connector';
import { Config, Effect, Option, Redacted, Schema } from 'effect';
import {
	HttpClient,
	HttpClientResponse,
} from 'effect/unstable/http';
import type { HttpClientRequest } from 'effect/unstable/http';

import { ConnectorError } from './types';
import type { ConnectorCredentialLease } from './types';

const INSTALLATION_LEASE_MS = 60 * 60 * 1000;
const REFRESH_SKEW_MS = 60 * 1000;

const PROVIDER_PREFIXES = {
	notion: 'NOTION_OAUTH',
	planetscale: 'PLANETSCALE_OAUTH',
	slack: 'SLACK',
	vercel: 'VERCEL',
} as const satisfies Record<OAuthConnector, string>;

export const permissionsFromScope = (
	scope: string | null | undefined
): Readonly<Record<string, string>> => (scope ? { scope } : {});

export const oneHourFromNow = () =>
	new Date(Date.now() + INSTALLATION_LEASE_MS).toISOString();

export const expiresAtFromSeconds = (seconds: number) =>
	new Date(Date.now() + seconds * 1000).toISOString();

export const connectorCallbackUrl = (
	publicApiUrl: string,
	connector: ManagedConnector
) =>
	new URL(`/v1/connectors/${connector}/callback`, publicApiUrl).toString();

export const optionalString = (key: string) =>
	Config.option(Config.string(key));

export const optionalStringWithDefault = Effect.fn(
	'OAuthClient.optionalStringWithDefault'
)(function* (key: string, fallback: string) {
	const configured = yield* optionalString(key);
	return Option.getOrElse(configured, () => fallback);
});

export const providerRedirectUri = Effect.fn('OAuthClient.providerRedirectUri')(
	function* (connector: OAuthConnector, publicApiUrl: string) {
		const prefix = PROVIDER_PREFIXES[connector];
		return yield* optionalStringWithDefault(
			`${prefix}_REDIRECT_URI`,
			connectorCallbackUrl(publicApiUrl, connector)
		);
	}
);

export const providerCredentials = Effect.fn('OAuthClient.providerCredentials')(
	function* (connector: OAuthConnector) {
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
	}
);

export const readProviderSchema = <A>(input: {
	readonly connector: OAuthConnector;
	readonly message: string;
	readonly request: HttpClientRequest.HttpClientRequest;
	readonly schema: Schema.Schema<A>;
}) =>
	Effect.gen(function* () {
		const client = (yield* HttpClient.HttpClient).pipe(
			HttpClient.filterStatusOk
		);
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

export const issueOAuthCredential = Effect.fn(
	'OAuthClient.issueOAuthCredential'
)(function* (input: {
	readonly connector: OAuthConnector;
	readonly credentials: ProviderCredentials | null;
	readonly extraValues?: (
		credentials: ProviderCredentials
	) => Readonly<Record<string, string>>;
	readonly refresh?: (
		credentials: ProviderCredentials
	) => Effect.Effect<
		ProviderCredentials,
		ConnectorError,
		HttpClient.HttpClient
	>;
}) {
	if (!input.credentials) {
		return yield* new ConnectorError({
			connector: input.connector,
			message: `${input.connector} installation has no stored credentials.`,
		});
	}

	const expiry = input.credentials.expiresAt
		? Date.parse(input.credentials.expiresAt)
		: undefined;
	const shouldRefresh =
		expiry !== undefined && expiry <= Date.now() + REFRESH_SKEW_MS;
	const credentials =
		input.refresh && shouldRefresh
			? yield* input.refresh(input.credentials)
			: input.credentials;

	const expiresAt = credentials.expiresAt ?? oneHourFromNow();
	if (Date.parse(expiresAt) <= Date.now()) {
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