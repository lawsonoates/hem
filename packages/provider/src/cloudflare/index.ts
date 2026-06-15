import { fromApiToken } from '@distilled.cloud/cloudflare';
import * as User from '@distilled.cloud/cloudflare/user';
import { Effect, Layer, Stream } from 'effect';
import { FetchHttpClient } from 'effect/unstable/http';

import type { Provider, Token } from '../provider';
import {
	ProviderAuthError,
	ProviderRateLimitError,
	ProviderRequestError,
	ProviderResponseError,
	ProviderUnavailableError,
} from '../provider';

export interface CloudflareInput {
	readonly accountId: string;
	readonly bootstrapToken: string;
	readonly body: {
		readonly name: string;
		readonly permissions: readonly string[];
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

/** Resolve permission group names to their Cloudflare permission group ids. */
const resolvePermissionGroups = (names: readonly string[]) =>
	Effect.gen(function* () {
		const groups = yield* Stream.runCollect(
			User.listTokenPermissionGroups.items({})
		);
		const idsByName = new Map(
			[...groups].flatMap((group) =>
				group.id && group.name ? [[group.name, group.id] as const] : []
			)
		);

		const ids: { id: string }[] = [];
		for (const name of names) {
			const id = idsByName.get(name);
			if (!id) {
				return yield* new ProviderRequestError({
					message: `Unknown Cloudflare permission "${name}". Permission names must match a Cloudflare token permission group, for example "Workers R2 Storage Write".`,
					provider: PROVIDER,
				});
			}
			ids.push({ id });
		}
		return ids;
	});

export const cloudflare = (input: CloudflareInput): Provider => ({
	mint: () =>
		Effect.gen(function* () {
			const permissionGroups = yield* resolvePermissionGroups(
				input.body.permissions
			);

			const result = yield* User.createToken({
				expiresOn: input.body.expiresOn,
				name: input.body.name,
				notBefore: input.body.notBefore,
				policies: [
					{
						effect: 'allow',
						permissionGroups,
						resources: {
							[`com.cloudflare.api.account.${input.accountId}`]:
								'*',
						},
					},
				],
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
					fromApiToken({ apiToken: input.bootstrapToken }),
					FetchHttpClient.layer
				)
			)
		),
});
