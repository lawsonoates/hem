import type { ProviderCredentials } from '@hem/core/connector';
import { CONNECTOR_DEFAULT_OUTPUTS } from '@hem/core/connector';
import { Context, Effect, Layer, Option } from 'effect';
import {
	FetchHttpClient,
	HttpClient,
	HttpClientRequest,
} from 'effect/unstable/http';

import { randomUuid } from '../prelude/id';
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
import { requireOAuthCode } from './types';
import type { ManagedConnectorService } from './types';

export type Interface = ManagedConnectorService;

export class Service extends Context.Service<Service, Interface>()(
	'@hem/console-api/connectors/PlanetScaleConnector'
) {}

export const layer = Layer.effect(
	Service,
	Effect.gen(function* () {
		const client = yield* HttpClient.HttpClient;
		const tokenInfo = (accessToken: string) =>
			readProviderSchema({
				client,
				connector: 'planetscale',
				message: 'PlanetScale could not inspect the OAuth token.',
				request: HttpClientRequest.get(
					'https://auth.planetscale.com/oauth/token/info'
				).pipe(HttpClientRequest.bearerToken(accessToken)),
				schema: PlanetScaleTokenInfoResponse,
			}).pipe(Effect.option, Effect.map(Option.getOrUndefined));

		const createAuthorizationUrl = Effect.fn(
			'PlanetScaleConnector.createAuthorizationUrl'
		)((state: string) =>
			Effect.gen(function* () {
				const publicApiUrl = yield* PublicApiUrl;
				const redirectUri = yield* providerRedirectUri(
					'planetscale',
					publicApiUrl
				);
				const { clientId } = yield* providerCredentials('planetscale');
				const url = new URL(
					'https://auth.planetscale.com/oauth/authorize'
				);

				url.searchParams.set('client_id', clientId);
				url.searchParams.set('redirect_uri', redirectUri);
				url.searchParams.set('state', state);

				return url.toString();
			})
		);

		const completeAuthorization = Effect.fn(
			'PlanetScaleConnector.completeAuthorization'
		)(
			(
				input: Parameters<
					ManagedConnectorService['completeAuthorization']
				>[0]
			) =>
				Effect.gen(function* () {
					const code = yield* requireOAuthCode(
						'planetscale',
						input.callback
					);
					const publicApiUrl = yield* PublicApiUrl;
					const redirectUri = yield* providerRedirectUri(
						'planetscale',
						publicApiUrl
					);
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
						client,
						connector: 'planetscale',
						message:
							'PlanetScale could not exchange the OAuth code.',
						request,
						schema: PlanetScaleTokenResponse,
					});
					const info = yield* tokenInfo(parsed.access_token);
					const subject = info?.sub ?? (yield* randomUuid);
					const scope = info?.scope ?? parsed.scope ?? null;
					const expiresAt = info?.exp
						? new Date(info.exp * 1000).toISOString()
						: (parsed.expires_in
							? yield* expiresAtFromSeconds(parsed.expires_in)
							: null);
					return {
						account: {
							id: subject,
							name: `PlanetScale ${subject}`,
							type: 'user' as const,
						},
						credentials: tokenCredentials({
							accessToken: parsed.access_token,
							expiresAt,
							refreshToken: parsed.refresh_token ?? null,
							scope,
							tokenType: parsed.token_type ?? 'Bearer',
						}),
						grantedPermissions: permissionsFromScope(scope),
						providerInstallationId: `planetscale:${subject}`,
					};
				})
		);

		const refreshCredentials = Effect.fn(
			'PlanetScaleConnector.refreshCredentials'
		)(function* (credentials: ProviderCredentials) {
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
				client,
				connector: 'planetscale',
				message: 'PlanetScale could not refresh the OAuth token.',
				request,
				schema: PlanetScaleTokenResponse,
			});
			return tokenCredentials({
				accessToken: parsed.access_token,
				expiresAt: parsed.expires_in
					? yield* expiresAtFromSeconds(parsed.expires_in)
					: null,
				refreshToken: parsed.refresh_token ?? credentials.refreshToken,
				scope: parsed.scope ?? credentials.scope,
				tokenType: parsed.token_type ?? credentials.tokenType,
			});
		});

		const issueCredential = Effect.fn(
			'PlanetScaleConnector.issueCredential'
		)((input: Parameters<ManagedConnectorService['issueCredential']>[0]) =>
			issueOAuthCredential({
				connector: 'planetscale',
				credentials: input.credentials,
				refresh: refreshCredentials,
			})
		);

		return Service.of({
			completeAuthorization,
			connector: 'planetscale',
			createAuthorizationUrl,
			issueCredential,
			outputsForInstallation: () => CONNECTOR_DEFAULT_OUTPUTS.planetscale,
		});
	})
);

export const defaultLayer = layer.pipe(Layer.provide(FetchHttpClient.layer));

// oxlint-disable-next-line import/no-self-import, oxc/no-barrel-file -- namespace projection for Effect service module
export * as PlanetScaleConnector from './planetscale';
