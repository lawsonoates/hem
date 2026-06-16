import { parseGrant } from '@hem/provider';
import { cloudflare } from '@hem/provider/cloudflare';
import { Console, Effect, Option } from 'effect';
import { Argument, Command, Flag } from 'effect/unstable/cli';

import { DotfileSecret } from '../dotfile/secret';
import { BunSecret } from '../secret/bun';
import { EnvSecret } from '../secret/env';
import { ProviderSecret } from '../secret/provider';
import { HemError } from '../util/error';

const envNamePattern = /^[A-Za-z_][A-Za-z0-9_]*$/u;

const validateEnvName = (name: string) =>
	envNamePattern.test(name)
		? Effect.succeed(name)
		: Effect.fail(
				new HemError({
					message:
						'Env name must start with a letter or underscore and contain only letters, numbers, and underscores.',
				})
			);

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

const add = Command.make(
	'add',
	{
		envName: Argument.string('name').pipe(
			Argument.withDescription('Environment variable name')
		),
		expiresOn: Flag.string('expires-on').pipe(
			Flag.withDescription('Token expiration as an ISO timestamp'),
			Flag.optional
		),
		from: Flag.choice('from', ['cloudflare']).pipe(
			Flag.withDescription('Provider to mint the env value from')
		),
		notBefore: Flag.string('not-before').pipe(
			Flag.withDescription('Token not-before time as an ISO timestamp'),
			Flag.optional
		),
		permission: Flag.string('permission').pipe(
			Flag.withDescription(
				'Permission to grant, e.g. "r2:write", "dns:edit@zone/example.com", or "raw:<group>"; can be repeated'
			),
			Flag.atLeast(1)
		),
		tokenName: Flag.string('name').pipe(
			Flag.withDescription('Provider token name'),
			Flag.optional
		),
	},
	({ envName, expiresOn, from, notBefore, permission, tokenName }) =>
		Effect.gen(function* () {
			const name = yield* validateEnvName(envName);
			if (from !== 'cloudflare') {
				return yield* new HemError({
					message: `Unsupported provider "${from}".`,
				});
			}

			const grants = yield* Effect.all(permission.map(parseGrant)).pipe(
				Effect.mapError(
					(error) => new HemError({ message: error.message })
				)
			);

			const connection = yield* resolveCloudflareConnection;

			const issued = yield* cloudflare({
				accountId: connection.accountId,
				body: {
					expiresOn: Option.getOrUndefined(expiresOn),
					grants,
					name: Option.getOrElse(tokenName, () => `hem:${name}`),
					notBefore: Option.getOrUndefined(notBefore),
				},
				managementToken: connection.managementToken,
			}).mint();

			if (!issued.value) {
				return yield* new HemError({
					message: 'Cloudflare did not return a token value.',
				});
			}

			const source: DotfileSecret.Source = {
				name: EnvSecret.name({
					env: name,
					provider: 'cloudflare',
				}),
				service: EnvSecret.service,
				type: 'keychain',
			};

			yield* BunSecret.set({
				name: source.name,
				service: source.service,
				value: issued.value,
			});

			yield* DotfileSecret.upsert({
				env: name,
				expiresOn: issued.expiresOn,
				issuedOn: issued.issuedOn,
				permissions: [...permission],
				provider: 'cloudflare',
				source,
				tokenId: issued.id,
			});

			yield* Console.log(`✓ Added ${name} from Cloudflare`);
		})
).pipe(Command.withDescription('Mint and store a provider-backed env var'));

const list = Command.make('list', {}, () =>
	DotfileSecret.read.pipe(
		Effect.flatMap((manifest) =>
			Effect.gen(function* () {
				if (manifest.secrets.length === 0)
					return yield* Console.log('No env vars added.');

				const headers = [
					'ENV',
					'FROM',
					'PERMISSIONS',
					'EXPIRES',
				] as const;
				const rows = manifest.secrets.map((entry) => [
					entry.env,
					entry.provider ?? '-',
					entry.permissions?.join(',') ?? '-',
					entry.expiresOn ?? '-',
				]);
				const widths = headers.map((header, index) =>
					Math.max(
						header.length,
						...rows.map((row) => (row[index] ?? '').length)
					)
				);
				const line = `+${widths.map((width) => '-'.repeat(width + 2)).join('+')}+`;
				const formatRow = (cols: readonly string[]) =>
					`| ${cols
						.map((col, index) => col.padEnd(widths[index] ?? 0))
						.join(' | ')} |`;

				yield* Console.log('');
				yield* Console.log(line);
				yield* Console.log(formatRow(headers));
				yield* Console.log(line);
				for (const row of rows) yield* Console.log(formatRow(row));
				yield* Console.log(line);
			})
		)
	)
).pipe(Command.withDescription('List locally added env vars'));

const rm = Command.make(
	'rm',
	{
		envName: Argument.string('name').pipe(
			Argument.withDescription('Environment variable name')
		),
	},
	({ envName }) =>
		Effect.gen(function* () {
			const name = yield* validateEnvName(envName);
			const removed = yield* DotfileSecret.remove(name);

			if (!removed) {
				return yield* Console.log(
					`No env var named ${name} was found.`
				);
			}

			yield* BunSecret.remove({
				name: removed.source.name,
				service: removed.source.service,
			});

			yield* Console.log(`✓ Removed ${name}.`);
		})
).pipe(Command.withDescription('Remove a locally added env var'));

export const envCommand = Command.make('env').pipe(
	Command.withDescription('Manage local provider-backed env vars'),
	Command.withSubcommands([add, list, rm])
);
