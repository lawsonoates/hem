import { CONNECTOR_DEFAULT_OUTPUTS } from '@hem/core/connector';
import { Config, Context, Effect, Layer } from 'effect';
import {
	FetchHttpClient,
	HttpClient,
	HttpClientRequest,
} from 'effect/unstable/http';
import {
	issueOAuthCredential,
	permissionsFromScope,
	providerCredentials,
	providerRedirectUri,
	PublicApiUrl,
	readProviderSchema,
	tokenCredentials,
} from './oauth-client';
import { SlackOAuthResponse } from './schemas';
import { requireOAuthCode } from './types';
import type { ManagedConnectorService } from './types';

export type Interface = ManagedConnectorService;

export class Service extends Context.Service<Service, Interface>()(
	'@hem/console-api/connectors/SlackConnector'
) {}

export const layer = Layer.effect(
	Service,
	Effect.gen(function* () {
		const client = yield* HttpClient.HttpClient;
		const createAuthorizationUrl = Effect.fn(
			'SlackConnector.createAuthorizationUrl'
		)((state: string) =>
			Effect.gen(function* () {
				const publicApiUrl = yield* PublicApiUrl;
				const redirectUri = yield* providerRedirectUri(
					'slack',
					publicApiUrl
				);
				const { clientId } = yield* providerCredentials('slack');
				const scopes = yield* Config.string('SLACK_BOT_SCOPES').pipe(
					Config.withDefault('chat:write')
				);
				const url = new URL('https://slack.com/oauth/v2/authorize');

				url.searchParams.set('client_id', clientId);
				url.searchParams.set('redirect_uri', redirectUri);
				url.searchParams.set('scope', scopes);
				url.searchParams.set('state', state);

				return url.toString();
			})
		);

		const completeAuthorization = Effect.fn(
			'SlackConnector.completeAuthorization'
		)(
			(
				input: Parameters<
					ManagedConnectorService['completeAuthorization']
				>[0]
			) =>
				Effect.gen(function* () {
					const code = yield* requireOAuthCode(
						'slack',
						input.callback
					);
					const publicApiUrl = yield* PublicApiUrl;
					const redirectUri = yield* providerRedirectUri(
						'slack',
						publicApiUrl
					);
					const { clientId, clientSecret } =
						yield* providerCredentials('slack');
					const request = HttpClientRequest.post(
						'https://slack.com/api/oauth.v2.access'
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
						connector: 'slack',
						message: 'Slack could not exchange the OAuth code.',
						request,
						schema: SlackOAuthResponse,
					});
					const teamId =
						response.team?.id ??
						response.enterprise?.id ??
						response.app_id ??
						'slack';
					const teamName =
						response.team?.name ??
						response.enterprise?.name ??
						'Slack workspace';
					const scope = response.scope ?? null;
					return {
						account: {
							id: teamId,
							name: teamName,
							type: response.team
								? ('workspace' as const)
								: ('enterprise' as const),
						},
						credentials: tokenCredentials({
							accessToken: response.access_token,
							scope,
							tokenType: response.token_type ?? 'bot',
						}),
						grantedPermissions: permissionsFromScope(scope),
						providerInstallationId: `slack:${teamId}`,
					};
				})
		);

		const issueCredential = Effect.fn('SlackConnector.issueCredential')(
			(
				input: Parameters<
					ManagedConnectorService['issueCredential']
				>[0]
			) =>
				issueOAuthCredential({
					connector: 'slack',
					credentials: input.credentials,
				})
		);

		return Service.of({
			completeAuthorization,
			connector: 'slack',
			createAuthorizationUrl,
			issueCredential,
			outputsForInstallation: () => CONNECTOR_DEFAULT_OUTPUTS.slack,
		});
	})
);

export const defaultLayer = layer.pipe(Layer.provide(FetchHttpClient.layer));

// oxlint-disable-next-line import/no-self-import, oxc/no-barrel-file -- namespace projection for Effect service module
export * as SlackConnector from './slack';
