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

export const connectCommand = Command.make('connect').pipe(
	Command.withDescription('Connect Hem to a provider'),
	Command.withSubcommands([cloudflare])
);
