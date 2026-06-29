import { CONNECTOR_DEFAULT_OUTPUTS } from '@hem/core/connector';
import { Config, Context, Effect, Layer, Option } from 'effect';
import {
	FetchHttpClient,
	HttpClient,
	HttpClientRequest,
} from 'effect/unstable/http';

import { randomUuid } from '../prelude/id';
import {
	issueOAuthCredential,
	optionalString,
	permissionsFromScope,
	providerCredentials,
	providerRedirectUri,
	PublicApiUrl,
	readProviderSchema,
	tokenCredentials,
} from './oauth-client';
import { VercelTokenResponse } from './schemas';
import { ConnectorError, requireOAuthCode } from './types';
import type { ConnectorAccount, ManagedConnectorService } from './types';

export type Interface = ManagedConnectorService;

export class Service extends Context.Service<Service, Interface>()(
	'@hem/console-api/connectors/VercelConnector'
) {}

export const layer = Layer.effect(
	Service,
	Effect.gen(function* () {
		const client = yield* HttpClient.HttpClient;
		const createVercelInstallUrl = Effect.fn(
			'VercelConnector.createInstallUrl'
		)(function* (state: string, redirectUri: string) {
			const explicitTemplate =
				yield* optionalString('VERCEL_INSTALL_URL');
			const template = Option.isSome(explicitTemplate)
				? explicitTemplate.value
				: `https://vercel.com/integrations/${yield* Config.string(
						'VERCEL_INTEGRATION_SLUG'
					).pipe(
						Effect.mapError(
							(cause) =>
								new ConnectorError({
									cause,
									connector: 'vercel',
									message:
										'Vercel install URL is not configured. Set VERCEL_INSTALL_URL or VERCEL_INTEGRATION_SLUG.',
								})
						)
					)}`;

			return yield* Effect.try({
				catch: (cause) =>
					new ConnectorError({
						cause,
						connector: 'vercel',
						message: 'Vercel install URL is invalid.',
					}),
				try: () => {
					const rendered = template
						.replaceAll('{state}', encodeURIComponent(state))
						.replaceAll(
							'{redirect_uri}',
							encodeURIComponent(redirectUri)
						);
					const url = new URL(rendered);
					if (!template.includes('{state}'))
						url.searchParams.set('state', state);
					return url.toString();
				},
			});
		});

		const createAuthorizationUrl = Effect.fn(
			'VercelConnector.createAuthorizationUrl'
		)((state: string) =>
			Effect.gen(function* () {
				const publicApiUrl = yield* PublicApiUrl;
				const redirectUri = yield* providerRedirectUri(
					'vercel',
					publicApiUrl
				);
				return yield* createVercelInstallUrl(state, redirectUri);
			})
		);

		const completeAuthorization = Effect.fn(
			'VercelConnector.completeAuthorization'
		)(
			(
				input: Parameters<
					ManagedConnectorService['completeAuthorization']
				>[0]
			) =>
				Effect.gen(function* () {
					const code = yield* requireOAuthCode(
						'vercel',
						input.callback
					);
					const publicApiUrl = yield* PublicApiUrl;
					const redirectUri = yield* providerRedirectUri(
						'vercel',
						publicApiUrl
					);
					const { clientId, clientSecret } =
						yield* providerCredentials('vercel');
					const request = HttpClientRequest.post(
						'https://api.vercel.com/v2/oauth/access_token'
					).pipe(
						HttpClientRequest.bodyUrlParams({
							client_id: clientId,
							client_secret: clientSecret,
							code,
							redirect_uri: redirectUri,
						})
					);
					const response = yield* readProviderSchema({
						client,
						connector: 'vercel',
						message: 'Vercel could not exchange the OAuth code.',
						request,
						schema: VercelTokenResponse,
					});
					const teamId = response.team_id ?? null;
					const userId = response.user_id ?? null;
					const ownerId = teamId ?? userId ?? (yield* randomUuid);
					const scope = response.scope ?? null;
					return {
						account: {
							id: ownerId,
							name: teamId
								? `Vercel team ${teamId}`
								: 'Vercel account',
							type: teamId
								? ('organization' as const)
								: ('user' as const),
						},
						credentials: tokenCredentials({
							accessToken: response.access_token,
							scope,
							teamId,
							tokenType: response.token_type ?? 'Bearer',
						}),
						grantedPermissions: permissionsFromScope(scope),
						providerInstallationId: `vercel:${ownerId}`,
					};
				})
		);

		const issueCredential = Effect.fn('VercelConnector.issueCredential')(
			(
				input: Parameters<ManagedConnectorService['issueCredential']>[0]
			) =>
				issueOAuthCredential({
					connector: 'vercel',
					credentials: input.credentials,
					extraValues: (credentials) => {
						const values: Record<string, string> = {};
						if (credentials.teamId)
							values.VERCEL_TEAM_ID = credentials.teamId;
						return values;
					},
				})
		);

		return Service.of({
			completeAuthorization,
			connector: 'vercel',
			createAuthorizationUrl,
			issueCredential,
			outputsForInstallation: (account: ConnectorAccount) =>
				account.type === 'organization'
					? ['VERCEL_TOKEN', 'VERCEL_TEAM_ID']
					: CONNECTOR_DEFAULT_OUTPUTS.vercel,
		});
	})
);

export const defaultLayer = layer.pipe(Layer.provide(FetchHttpClient.layer));

// oxlint-disable-next-line import/no-self-import, oxc/no-barrel-file -- namespace projection for Effect service module
export * as VercelConnector from './vercel';
