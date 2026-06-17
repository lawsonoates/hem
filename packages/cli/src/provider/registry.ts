import { providers } from '@hem/provider';
import type { Grant, Provider as ProviderName } from '@hem/provider';
import { aws, DEFAULT_LABELS as AWS_DEFAULT_LABELS } from '@hem/provider/aws';
import {
	cloudflare,
	DEFAULT_LABELS as CLOUDFLARE_DEFAULT_LABELS,
} from '@hem/provider/cloudflare';
import { Effect } from 'effect';

import { BunSecret } from '../secret/bun';
import { ProviderSecret } from '../secret/provider';
import { HemError } from '../util/error';

export interface MintOptions {
	readonly grants: readonly Grant[];
	readonly permissions: readonly string[];
}

interface CloudflareConnection {
	readonly accountId: string;
	readonly managementToken: string;
}

interface AwsConnection {
	readonly accessKeyId: string;
	readonly region: string;
	readonly secretAccessKey: string;
}

const resolveCloudflareConnection = Effect.gen(function* () {
	const [managementToken, accountId] = yield* Effect.all(
		[
			BunSecret.get({
				name: ProviderSecret.name({
					key: 'management-token',
					provider: 'cloudflare',
				}),
				service: ProviderSecret.service,
			}),
			BunSecret.get({
				name: ProviderSecret.name({
					key: 'account-id',
					provider: 'cloudflare',
				}),
				service: ProviderSecret.service,
			}),
		],
		{ concurrency: 'unbounded' }
	);

	if (!managementToken || !accountId) {
		return yield* new HemError({
			message:
				'Cloudflare is not connected. Run `hem connect cloudflare` first.',
		});
	}

	return { accountId, managementToken } as const;
});

const resolveAwsConnection = Effect.gen(function* () {
	const [accessKeyId, secretAccessKey, region] = yield* Effect.all(
		[
			BunSecret.get({
				name: ProviderSecret.name({
					key: 'access-key-id',
					provider: 'aws',
				}),
				service: ProviderSecret.service,
			}),
			BunSecret.get({
				name: ProviderSecret.name({
					key: 'secret-access-key',
					provider: 'aws',
				}),
				service: ProviderSecret.service,
			}),
			BunSecret.get({
				name: ProviderSecret.name({
					key: 'region',
					provider: 'aws',
				}),
				service: ProviderSecret.service,
			}),
		],
		{ concurrency: 'unbounded' }
	);

	if (!accessKeyId || !secretAccessKey || !region) {
		return yield* new HemError({
			message: 'AWS is not connected. Run `hem connect aws` first.',
		});
	}

	return { accessKeyId, region, secretAccessKey } as const;
});

const providerRegistry = {
	aws: {
		create: (connection: AwsConnection, options: MintOptions) =>
			aws({
				accessKeyId: connection.accessKeyId,
				body: { grants: options.grants },
				region: connection.region,
				secretAccessKey: connection.secretAccessKey,
			}),
		defaultLabels: AWS_DEFAULT_LABELS,
		displayName: 'AWS',
		resolveConnection: resolveAwsConnection,
	},
	cloudflare: {
		create: (connection: CloudflareConnection, options: MintOptions) =>
			cloudflare({
				accountId: connection.accountId,
				body: { grants: options.grants },
				managementToken: connection.managementToken,
			}),
		defaultLabels: CLOUDFLARE_DEFAULT_LABELS,
		displayName: 'Cloudflare',
		resolveConnection: resolveCloudflareConnection,
	},
} as const;

export const providerChoices = [...providers];

export const getProviderConfig = (provider: ProviderName) =>
	providerRegistry[provider];

export const mintFromProvider = (
	provider: ProviderName,
	options: MintOptions
) => {
	switch (provider) {
		case 'aws': {
			return Effect.gen(function* () {
				const connection =
					yield* providerRegistry.aws.resolveConnection;
				return yield* providerRegistry.aws
					.create(connection, options)
					.mint();
			});
		}
		case 'cloudflare': {
			return Effect.gen(function* () {
				const connection =
					yield* providerRegistry.cloudflare.resolveConnection;
				return yield* providerRegistry.cloudflare
					.create(connection, options)
					.mint();
			});
		}
	}
};
