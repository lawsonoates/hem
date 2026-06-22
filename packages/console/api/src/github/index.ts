import { Config, Context, Effect, flow, Layer, Redacted, Schema } from 'effect';
import {
	FetchHttpClient,
	HttpClient,
	HttpClientRequest,
	HttpClientResponse,
} from 'effect/unstable/http';

const GITHUB_API_VERSION = '2022-11-28';
const RSA_ALGORITHM_IDENTIFIER = Uint8Array.from([
	0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01,
	0x01, 0x05, 0x00,
]);

export interface CompletedGithubInstallation {
	readonly account: {
		readonly id: string;
		readonly name: string;
		readonly type: 'user' | 'organization';
	};
	readonly grantedPermissions: Readonly<Record<string, string>>;
	readonly providerInstallationId: string;
}

export interface GithubCredential {
	readonly expiresAt: string;
	readonly token: string;
}

export interface IssueGithubCredentialInput {
	readonly providerInstallationId: string;
}

export interface Interface {
	readonly completeInstallation: (
		providerInstallationId: string
	) => Effect.Effect<CompletedGithubInstallation, GithubConnectorError>;
	readonly createInstallationUrl: (state: string) => string;
	readonly issueCredential: (
		input: IssueGithubCredentialInput
	) => Effect.Effect<GithubCredential, GithubConnectorError>;
}

export class GithubConnectorError extends Schema.TaggedErrorClass<GithubConnectorError>()(
	'GithubConnectorError',
	{
		cause: Schema.Defect,
		message: Schema.String,
	}
) {}

class GithubInstallationResponse extends Schema.Class<GithubInstallationResponse>(
	'@hem/console-api/github/GithubInstallationResponse'
)({
	account: Schema.Struct({
		id: Schema.Number,
		login: Schema.String,
		type: Schema.String,
	}),
	id: Schema.Number,
	permissions: Schema.Record(Schema.String, Schema.String),
}) {}

class GithubAccessTokenResponse extends Schema.Class<GithubAccessTokenResponse>(
	'@hem/console-api/github/GithubAccessTokenResponse'
)({
	expires_at: Schema.String,
	token: Schema.String,
}) {}

const bytesToBase64Url = (bytes: Uint8Array) => {
	let binary = '';
	for (const byte of bytes) binary += String.fromCodePoint(byte);
	return btoa(binary)
		.replaceAll('+', '-')
		.replaceAll('/', '_')
		.replace(/=+$/u, '');
};

const stringToBase64Url = (value: string) =>
	bytesToBase64Url(new TextEncoder().encode(value));

const concatBytes = (...parts: readonly Uint8Array[]) => {
	const result = new Uint8Array(
		parts.reduce((length, part) => length + part.length, 0)
	);
	let offset = 0;
	for (const part of parts) {
		result.set(part, offset);
		offset += part.length;
	}
	return result;
};

const encodeDerLength = (length: number) => {
	if (length < 0x80) return Uint8Array.of(length);
	const bytes: number[] = [];
	for (
		let remaining = length;
		remaining > 0;
		remaining = Math.floor(remaining / 256)
	)
		bytes.unshift(remaining % 256);

	return Uint8Array.of(0x80 + bytes.length, ...bytes);
};

const derValue = (tag: number, value: Uint8Array) =>
	concatBytes(Uint8Array.of(tag), encodeDerLength(value.length), value);

const wrapPkcs1AsPkcs8 = (pkcs1: Uint8Array) =>
	derValue(
		0x30,
		concatBytes(
			Uint8Array.of(0x02, 0x01, 0x00),
			RSA_ALGORITHM_IDENTIFIER,
			derValue(0x04, pkcs1)
		)
	);

const decodePem = (pem: string, label: string) => {
	const encoded = pem
		.replace(`-----BEGIN ${label}-----`, '')
		.replace(`-----END ${label}-----`, '')
		.replaceAll(/\s/gu, '');
	const binary = atob(encoded);
	return Uint8Array.from(
		binary,
		(character) => character.codePointAt(0) ?? 0
	);
};

const pkcs8Bytes = (pem: string) => {
	if (pem.includes('-----BEGIN PRIVATE KEY-----'))
		return decodePem(pem, 'PRIVATE KEY');

	if (pem.includes('-----BEGIN RSA PRIVATE KEY-----'))
		return wrapPkcs1AsPkcs8(decodePem(pem, 'RSA PRIVATE KEY'));

	throw new Error('GitHub App private key must be PKCS#1 or PKCS#8 PEM.');
};

export const createGithubAppJwt = (input: {
	readonly appId: string;
	readonly now: Date;
	readonly privateKey: Redacted.Redacted<string>;
}) =>
	Effect.tryPromise({
		catch: (cause) =>
			new GithubConnectorError({
				cause,
				message: 'Could not sign a GitHub App JWT.',
			}),
		try: async () => {
			const issuedAt = Math.floor(input.now.getTime() / 1000) - 60;
			const header = stringToBase64Url(
				JSON.stringify({ alg: 'RS256', typ: 'JWT' })
			);
			const payload = stringToBase64Url(
				JSON.stringify({
					exp: issuedAt + 9 * 60,
					iat: issuedAt,
					iss: input.appId,
				})
			);
			const unsigned = `${header}.${payload}`;
			const key = await crypto.subtle.importKey(
				'pkcs8',
				pkcs8Bytes(Redacted.value(input.privateKey)),
				{ hash: 'SHA-256', name: 'RSASSA-PKCS1-v1_5' },
				false,
				['sign']
			);
			const signature = await crypto.subtle.sign(
				'RSASSA-PKCS1-v1_5',
				key,
				new TextEncoder().encode(unsigned)
			);
			return `${unsigned}.${bytesToBase64Url(new Uint8Array(signature))}`;
		},
	});

const installationUrl = (appSlug: string, state: string) => {
	const url = new URL(
		`https://github.com/apps/${encodeURIComponent(appSlug)}/installations/new`
	);
	url.searchParams.set('state', state);
	return url.toString();
};

export class Service extends Context.Service<Service, Interface>()(
	'@hem/console-api/github/GithubConnector'
) {}

export const layer = Layer.effect(
	Service,
	Effect.gen(function* () {
		const apiBaseUrl = yield* Config.string('GITHUB_API_URL').pipe(
			Config.withDefault('https://api.github.com')
		);
		const appId = yield* Config.string('GITHUB_APP_ID');
		const appSlug = yield* Config.string('GITHUB_APP_SLUG');
		const privateKey = yield* Config.redacted('GITHUB_APP_PRIVATE_KEY');
		const client = (yield* HttpClient.HttpClient).pipe(
			HttpClient.mapRequest(
				flow(
					HttpClientRequest.prependUrl(apiBaseUrl),
					HttpClientRequest.acceptJson,
					HttpClientRequest.setHeader(
						'x-github-api-version',
						GITHUB_API_VERSION
					)
				)
			),
			HttpClient.filterStatusOk
		);

		const appRequest = (request: HttpClientRequest.HttpClientRequest) =>
			Effect.gen(function* () {
				const jwt = yield* createGithubAppJwt({
					appId,
					now: new Date(),
					privateKey,
				});
				return yield* request.pipe(
					HttpClientRequest.bearerToken(jwt),
					client.execute,
					Effect.mapError((cause) =>
						cause instanceof GithubConnectorError
							? cause
							: new GithubConnectorError({
									cause,
									message:
										'GitHub rejected the connector request.',
								})
					)
				);
			});

		const completeInstallation = Effect.fn(
			'GithubConnector.completeInstallation'
		)(function* (providerInstallationId: string) {
			const response = yield* appRequest(
				HttpClientRequest.get(
					`/app/installations/${encodeURIComponent(providerInstallationId)}`
				)
			).pipe(
				Effect.flatMap(
					HttpClientResponse.schemaBodyJson(
						GithubInstallationResponse
					)
				),
				Effect.mapError((cause) =>
					cause instanceof GithubConnectorError
						? cause
						: new GithubConnectorError({
								cause,
								message:
									'GitHub returned an invalid installation.',
							})
				)
			);
			return {
				account: {
					id: String(response.account.id),
					name: response.account.login,
					type:
						response.account.type === 'Organization'
							? ('organization' as const)
							: ('user' as const),
				},
				grantedPermissions: response.permissions,
				providerInstallationId: String(response.id),
			} satisfies CompletedGithubInstallation;
		});

		const issueCredential = Effect.fn('GithubConnector.issueCredential')(
			function* (input: IssueGithubCredentialInput) {
				const request = HttpClientRequest.post(
					`/app/installations/${encodeURIComponent(input.providerInstallationId)}/access_tokens`
				);
				const response = yield* appRequest(request).pipe(
					Effect.flatMap(
						HttpClientResponse.schemaBodyJson(
							GithubAccessTokenResponse
						)
					),
					Effect.mapError((cause) =>
						cause instanceof GithubConnectorError
							? cause
							: new GithubConnectorError({
									cause,
									message:
										'GitHub returned an invalid access token.',
								})
					)
				);
				return {
					expiresAt: response.expires_at,
					token: response.token,
				} satisfies GithubCredential;
			}
		);

		return Service.of({
			completeInstallation,
			createInstallationUrl: (state) => installationUrl(appSlug, state),
			issueCredential,
		});
	})
);

export const defaultLayer = layer.pipe(Layer.provide(FetchHttpClient.layer));

// oxlint-disable-next-line import/no-self-import, oxc/no-barrel-file -- namespace projection for Effect service module
export * as GithubConnector from '.';
