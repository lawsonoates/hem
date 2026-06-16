import { fromApiToken } from '@distilled.cloud/cloudflare';
import * as User from '@distilled.cloud/cloudflare/user';
import { Effect, Layer } from 'effect';
import { FetchHttpClient } from 'effect/unstable/http';

import type { Grant } from '../grant';
import type { Provider, Token } from '../provider';
import {
	ProviderAuthError,
	ProviderRateLimitError,
	ProviderRequestError,
	ProviderResponseError,
	ProviderUnavailableError,
} from '../provider';
import { translateGrants } from './permissions';

export interface CloudflareInput {
	readonly accountId: string;
	readonly managementToken: string;
	readonly body: {
		readonly name: string;
		readonly grants: readonly Grant[];
		readonly expiresOn?: string;
		readonly notBefore?: string;
	};
}

const PROVIDER = 'cloudflare';

const toToken = (result: User.CreateTokenResponse): Token | null => {
	if (!result.id || !result.name) return null;
	return {
		expiresOn: result.expiresOn ?? undefined,
		id: result.id,
		issuedOn: result.issuedOn ?? undefined,
		name: result.name,
		notBefore: result.notBefore ?? undefined,
		value: result.value ?? undefined,
	};
};

export const cloudflare = (input: CloudflareInput): Provider => ({
	mint: () =>
		Effect.gen(function* () {
			const policies = yield* translateGrants(
				input.body.grants,
				input.accountId
			);

			const result = yield* User.createToken({
				expiresOn: input.body.expiresOn,
				name: input.body.name,
				notBefore: input.body.notBefore,
				policies,
			});

			const token = toToken(result);
			if (!token) {
				return yield* new ProviderResponseError({
					message:
						'Cloudflare API returned an incomplete token response',
					provider: PROVIDER,
				});
			}
			return token;
		}).pipe(
			// Map Cloudflare's SDK/HTTP errors onto the provider-agnostic set so
			// the CLI never has to know about Cloudflare-specific tags. Errors we
			// already raise as `ProviderError` above pass straight through.
			Effect.mapError((error) => {
				switch (error._tag) {
					case 'ProviderRequestError':
					case 'ProviderResponseError': {
						return error;
					}
					case 'Unauthorized': {
						return new ProviderAuthError({
							cause: error,
							message: error.message,
							provider: PROVIDER,
						});
					}
					case 'TooManyRequests': {
						return new ProviderRateLimitError({
							cause: error,
							message: error.message,
							provider: PROVIDER,
						});
					}
					case 'InternalServerError':
					case 'BadGateway':
					case 'ServiceUnavailable':
					case 'GatewayTimeout': {
						return new ProviderUnavailableError({
							cause: error,
							message: error.message,
							provider: PROVIDER,
						});
					}
					case 'InvalidRoute':
					case 'InvalidTokenName':
					case 'PermissionGroupNotFound': {
						return new ProviderRequestError({
							cause: error,
							message: error.message,
							provider: PROVIDER,
						});
					}
					case 'CloudflareHttpError':
					case 'UnknownCloudflareError': {
						return new ProviderResponseError({
							cause: error,
							message: error.message,
							provider: PROVIDER,
						});
					}
					case 'CloudflareParseError': {
						return new ProviderResponseError({
							cause: error,
							message:
								'Cloudflare returned a response that could not be parsed.',
							provider: PROVIDER,
						});
					}
					default: {
						return new ProviderResponseError({
							cause: error,
							message: 'Unexpected Cloudflare error.',
							provider: PROVIDER,
						});
					}
				}
			}),
			Effect.provide(
				Layer.mergeAll(
					fromApiToken({ apiToken: input.managementToken }),
					FetchHttpClient.layer
				)
			)
		),
});
