import { CONNECTOR_DEFAULT_OUTPUTS } from '@hem/core/connector';
import { Context, Effect, Layer } from 'effect';
import { HttpClient, HttpClientRequest } from 'effect/unstable/http';

import {
	issueOAuthCredential,
	permissionsFromScope,
	providerCredentials,
	providerRedirectUri,
	PublicApiUrl,
	readProviderSchema,
	tokenCredentials,
} from './oauth-client';
import { NotionTokenResponse } from './schemas';
import { ConnectorError, requireOAuthCode } from './types';
import type {
	CompletedConnectorInstallation,
	ConnectorCredentialLease,
	ManagedConnectorService,
} from './types';

const NOTION_VERSION = '2026-03-11';

export type Interface = ManagedConnectorService;

export class Service extends Context.Service<Service, Interface>()(
	'@hem/console-api/connectors/NotionConnector'
) {}

const mapConnectorError = (cause: unknown) =>
	cause instanceof ConnectorError
		? cause
		: new ConnectorError({
				cause,
				connector: 'notion',
				message: 'Notion connector request failed.',
			});

const createAuthorizationUrl = Effect.fn(
	'NotionConnector.createAuthorizationUrl'
)(function* (state: string) {
	const publicApiUrl = yield* PublicApiUrl;
	const redirectUri = yield* providerRedirectUri('notion', publicApiUrl);
	const { clientId } = yield* providerCredentials('notion');
	const url = new URL('https://api.notion.com/v1/oauth/authorize');

	url.searchParams.set('client_id', clientId);
	url.searchParams.set('owner', 'user');
	url.searchParams.set('redirect_uri', redirectUri);
	url.searchParams.set('response_type', 'code');
	url.searchParams.set('state', state);

	return url.toString();
});

const completeAuthorization = Effect.fn(
	'NotionConnector.completeAuthorization'
)(function* (
	input: Parameters<ManagedConnectorService['completeAuthorization']>[0]
) {
	const code = yield* requireOAuthCode('notion', input.callback);
	const publicApiUrl = yield* PublicApiUrl;
	const redirectUri = yield* providerRedirectUri('notion', publicApiUrl);
	const { clientId, clientSecret } = yield* providerCredentials('notion');
	const request = HttpClientRequest.post(
		'https://api.notion.com/v1/oauth/token'
	).pipe(
		HttpClientRequest.basicAuth(clientId, clientSecret),
		HttpClientRequest.bodyJsonUnsafe({
			code,
			grant_type: 'authorization_code',
			redirect_uri: redirectUri,
		}),
		HttpClientRequest.setHeader('Notion-Version', NOTION_VERSION)
	);
	const response = yield* readProviderSchema({
		connector: 'notion',
		message: 'Notion could not exchange the OAuth code.',
		request,
		schema: NotionTokenResponse,
	});
	const scope = response.scope ?? null;
	return {
		account: {
			id: response.workspace_id,
			name: response.workspace_name ?? 'Notion workspace',
			type: 'workspace',
		},
		credentials: tokenCredentials({
			accessToken: response.access_token,
			refreshToken: response.refresh_token ?? null,
			scope,
			tokenType: response.token_type ?? 'bearer',
		}),
		grantedPermissions: permissionsFromScope(scope),
		providerInstallationId: `notion:${response.workspace_id}`,
	} satisfies CompletedConnectorInstallation;
});

const issueCredential = Effect.fn('NotionConnector.issueCredential')(
	(input: Parameters<ManagedConnectorService['issueCredential']>[0]) =>
		issueOAuthCredential({
			connector: 'notion',
			credentials: input.credentials,
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
			connector: 'notion',
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
			outputsForInstallation: () => CONNECTOR_DEFAULT_OUTPUTS.notion,
		});
	})
);

export const defaultLayer = layer;

// oxlint-disable-next-line import/no-self-import, oxc/no-barrel-file -- namespace projection for Effect service module
export * as NotionConnector from './notion';