import type { ProviderCredentials } from '@hem/console-core/database/schema/installation';
import { CONNECTOR_DEFAULT_OUTPUTS } from '@hem/core/connector';
import { Context, Effect, Layer, Option } from 'effect';
import { HttpClient, HttpClientRequest } from 'effect/unstable/http';

import {
	expiresAtFromSeconds,
	issueOAuthCredential,
	permissionsFromScope,
	providerCredentials,
	providerRedirectUri,
	PublicApiUrl,
	readProviderSchema,
	tokenCredentials,
} from './oauth-client';
import {
	PlanetScaleTokenInfoResponse,
	PlanetScaleTokenResponse,
} from './schemas';
import { ConnectorError, requireOAuthCode } from './types';
import type {
	CompletedConnectorInstallation,
	ConnectorCredentialLease,
	ManagedConnectorService,
} from './types';

export type Interface = ManagedConnectorService;

export class Service extends Context.Service<Service, Interface>()(
	'@hem/console-api/connectors/PlanetScaleConnector'
) {}

const mapConnectorError = (cause: unknown) =>
	cause instanceof ConnectorError
		? cause
		: new ConnectorError({
				cause,
				connector: 'planetscale',
				message: 'PlanetScale connector request failed.',
			});

const tokenInfo = (accessToken: string) =>
	readProviderSchema({
		connector: 'planetscale',
		message: 'PlanetScale could not inspect the OAuth token.',
		request: HttpClientRequest.get(
			'https://auth.planetscale.com/oauth/token/info'
		).pipe(HttpClientRequest.bearerToken(accessToken)),
		schema: PlanetScaleTokenInfoResponse,
	}).pipe(Effect.option, Effect.map(Option.getOrUndefined));

const createAuthorizationUrl = Effect.fn(
	'PlanetScaleConnector.createAuthorizationUrl'
)(function* (state: string) {
	const publicApiUrl = yield* PublicApiUrl;
	const redirectUri = yield* providerRedirectUri('planetscale', publicApiUrl);
	const { clientId } = yield* providerCredentials('planetscale');
	const url = new URL('https://auth.planetscale.com/oauth/authorize');

	url.searchParams.set('client_id', clientId);
	url.searchParams.set('redirect_uri', redirectUri);
	url.searchParams.set('state', state);

	return url.toString();
});

const completeAuthorization = Effect.fn(
	'PlanetScaleConnector.completeAuthorization'
)(function* (
	input: Parameters<ManagedConnectorService['completeAuthorization']>[0]
) {
	const code = yield* requireOAuthCode('planetscale', input.callback);
	const publicApiUrl = yield* PublicApiUrl;
	const redirectUri = yield* providerRedirectUri('planetscale', publicApiUrl);
	const { clientId, clientSecret } =
		yield* providerCredentials('planetscale');
	const request = HttpClientRequest.post(
		'https://auth.planetscale.com/oauth/token'
	).pipe(
		HttpClientRequest.bodyUrlParams({
			client_id: clientId,
			client_secret: clientSecret,
			code,
			grant_type: 'authorization_code',
			redirect_uri: redirectUri,
		})
	);
	const parsed = yield* readProviderSchema({
		connector: 'planetscale',
		message: 'PlanetScale could not exchange the OAuth code.',
		request,
		schema: PlanetScaleTokenResponse,
	});
	const info = yield* tokenInfo(parsed.access_token);
	const subject = info?.sub ?? crypto.randomUUID();
	const scope = info?.scope ?? parsed.scope ?? null;
	return {
		account: {
			id: subject,
			name: `PlanetScale ${subject}`,
			type: 'user',
		},
		credentials: tokenCredentials({
			accessToken: parsed.access_token,
			expiresAt: info?.exp
				? new Date(info.exp * 1000).toISOString()
				: parsed.expires_in
					? expiresAtFromSeconds(parsed.expires_in)
					: null,
			refreshToken: parsed.refresh_token ?? null,
			scope,
			tokenType: parsed.token_type ?? 'Bearer',
		}),
		grantedPermissions: permissionsFromScope(scope),
		providerInstallationId: `planetscale:${subject}`,
	} satisfies CompletedConnectorInstallation;
});

const refreshCredentials = Effect.fn('PlanetScaleConnector.refreshCredentials')(
	function* (credentials: ProviderCredentials) {
		if (!credentials.refreshToken) return credentials;
		const { clientId, clientSecret } =
			yield* providerCredentials('planetscale');
		const request = HttpClientRequest.post(
			'https://auth.planetscale.com/oauth/token'
		).pipe(
			HttpClientRequest.bodyUrlParams({
				client_id: clientId,
				client_secret: clientSecret,
				grant_type: 'refresh_token',
				refresh_token: credentials.refreshToken,
			})
		);
		const parsed = yield* readProviderSchema({
			connector: 'planetscale',
			message: 'PlanetScale could not refresh the OAuth token.',
			request,
			schema: PlanetScaleTokenResponse,
		});
		return tokenCredentials({
			accessToken: parsed.access_token,
			expiresAt: parsed.expires_in
				? expiresAtFromSeconds(parsed.expires_in)
				: null,
			refreshToken: parsed.refresh_token ?? credentials.refreshToken,
			scope: parsed.scope ?? credentials.scope,
			tokenType: parsed.token_type ?? credentials.tokenType,
		});
	}
);

const issueCredential = Effect.fn('PlanetScaleConnector.issueCredential')(
	(input: Parameters<ManagedConnectorService['issueCredential']>[0]) =>
		issueOAuthCredential({
			connector: 'planetscale',
			credentials: input.credentials,
			refresh: (credentials) =>
				refreshCredentials(credentials) as Effect.Effect<
					ProviderCredentials,
					ConnectorError,
					HttpClient.HttpClient
				>,
		})
);

export const layer = Layer.effect(
	Service,
	Effect.gen(function* () {
		const client = yield* HttpClient.HttpClient;
		const run = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
			effect.pipe(
				Effect.provideService(HttpClient.HttpClient, client),
				Effect.mapError(mapConnectorError)
			);

		return Service.of({
			completeAuthorization: (input) =>
				run(completeAuthorization(input)) as Effect.Effect<
					CompletedConnectorInstallation,
					ConnectorError
				>,
			connector: 'planetscale',
			createAuthorizationUrl: (state) =>
				run(createAuthorizationUrl(state)) as Effect.Effect<
					string,
					ConnectorError
				>,
			issueCredential: (input) =>
				run(issueCredential(input)) as Effect.Effect<
					ConnectorCredentialLease,
					ConnectorError
				>,
			outputsForInstallation: () => CONNECTOR_DEFAULT_OUTPUTS.planetscale,
		});
	})
);

export const defaultLayer = layer;

// oxlint-disable-next-line import/no-self-import, oxc/no-barrel-file -- namespace projection for Effect service module
export * as PlanetScaleConnector from './planetscale';