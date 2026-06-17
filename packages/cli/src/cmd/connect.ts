import { Console, Effect, Redacted } from 'effect';
import { Command, Prompt } from 'effect/unstable/cli';

import { BunSecret } from '../secret/bun';
import { ProviderSecret } from '../secret/provider';

const requireInput = (label: string, value: string) =>
	value.length > 0
		? Effect.succeed(value)
		: Effect.fail(`${label} is required.`);

const cloudflare = Command.make('cloudflare', {}, () =>
	Effect.gen(function* () {
		const { accountId, managementToken } = yield* Prompt.run(
			Prompt.all({
				accountId: Prompt.text({
					message: 'Cloudflare account ID',
					validate: (value) => requireInput('Account ID', value),
				}),
				managementToken: Prompt.password({
					message: 'Cloudflare API token',
					validate: (value) => requireInput('Token', value),
				}),
			})
		);

		yield* Effect.all(
			[
				BunSecret.set({
					name: ProviderSecret.name({
						key: 'management-token',
						provider: 'cloudflare',
					}),
					service: ProviderSecret.service,
					value: Redacted.value(managementToken),
				}),
				BunSecret.set({
					name: ProviderSecret.name({
						key: 'account-id',
						provider: 'cloudflare',
					}),
					service: ProviderSecret.service,
					value: accountId,
				}),
			],
			{ concurrency: 'unbounded' }
		);

		yield* Console.log('✓ Connected Cloudflare');
	})
).pipe(Command.withDescription('Store Cloudflare provider credentials'));

const aws = Command.make('aws', {}, () =>
	Effect.gen(function* () {
		const { accessKeyId, region, secretAccessKey } = yield* Prompt.run(
			Prompt.all({
				accessKeyId: Prompt.text({
					message: 'AWS access key ID',
					validate: (value) => requireInput('Access key ID', value),
				}),
				region: Prompt.text({
					default: 'us-east-1',
					message: 'Default AWS region',
					validate: (value) => requireInput('Region', value),
				}),
				secretAccessKey: Prompt.password({
					message: 'AWS secret access key',
					validate: (value) =>
						requireInput('Secret access key', value),
				}),
			})
		);

		yield* Effect.all(
			[
				BunSecret.set({
					name: ProviderSecret.name({
						key: 'access-key-id',
						provider: 'aws',
					}),
					service: ProviderSecret.service,
					value: accessKeyId,
				}),
				BunSecret.set({
					name: ProviderSecret.name({
						key: 'secret-access-key',
						provider: 'aws',
					}),
					service: ProviderSecret.service,
					value: Redacted.value(secretAccessKey),
				}),
				BunSecret.set({
					name: ProviderSecret.name({
						key: 'region',
						provider: 'aws',
					}),
					service: ProviderSecret.service,
					value: region,
				}),
			],
			{ concurrency: 'unbounded' }
		);

		yield* Console.log('✓ Connected AWS');
	})
).pipe(Command.withDescription('Store AWS provider credentials'));

export const connectCommand = Command.make('connect').pipe(
	Command.withDescription('Connect Hem to a provider'),
	Command.withSubcommands([aws, cloudflare])
);
