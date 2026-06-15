import { cloudflare } from '@hem/provider/cloudflare';
import { Config, Console, Effect, Option, Redacted } from 'effect';
import { Argument, Command, Flag } from 'effect/unstable/cli';

import { LocalSecret } from '../local-secret';
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
				'Provider permission to grant; can be repeated'
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

			const bootstrapToken = yield* Config.redacted(
				'CLOUDFLARE_API_TOKEN'
			);
			const accountId = yield* Config.string('CLOUDFLARE_ACCOUNT_ID');

			const issued = yield* cloudflare({
				accountId,
				body: {
					expiresOn: Option.getOrUndefined(expiresOn),
					name: Option.getOrElse(tokenName, () => `hem:${name}`),
					notBefore: Option.getOrUndefined(notBefore),
					permissions: [...permission],
				},
				bootstrapToken: Redacted.value(bootstrapToken),
			}).mint();

			if (!issued.value) {
				return yield* new HemError({
					message: 'Cloudflare did not return a token value.',
				});
			}

			yield* LocalSecret.add({
				env: name,
				expiresOn: issued.expiresOn,
				issuedOn: issued.issuedOn,
				permissions: [...permission],
				provider: 'cloudflare',
				tokenId: issued.id,
				value: issued.value,
			});

			yield* Console.log(
				`✓ Added ${name} from Cloudflare and stored it in the system keychain.`
			);
		})
).pipe(Command.withDescription('Mint and store a provider-backed env var'));

const list = Command.make('list', {}, () =>
	LocalSecret.list.pipe(
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
			const removed = yield* LocalSecret.remove(name);

			if (!removed) {
				return yield* Console.log(
					`No env var named ${name} was found.`
				);
			}

			yield* Console.log(`✓ Removed ${name}.`);
		})
).pipe(Command.withDescription('Remove a locally added env var'));

export const envCommand = Command.make('env').pipe(
	Command.withDescription('Manage local provider-backed env vars'),
	Command.withSubcommands([add, list, rm])
);
