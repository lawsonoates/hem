import { parseGrant } from '@hem/provider';
import { Console, Effect } from 'effect';
import { Argument, Command, Flag } from 'effect/unstable/cli';

import { DotfileSecret } from '../dotfile/secret';
import {
	getProviderConfig,
	mintFromProvider,
	providerChoices,
} from '../provider/registry';
import { BunSecret } from '../secret/bun';
import { EnvSecret } from '../secret/env';
import { HemError } from '../util/error';

const envNamePattern = /^[A-Za-z_][A-Za-z0-9_]*$/u;

const validateEnvLabel = (name: string) =>
	envNamePattern.test(name)
		? Effect.succeed(DotfileSecret.envLabel(name))
		: Effect.fail(
				new HemError({
					message:
						'Env name must start with a letter or underscore and contain only letters, numbers, and underscores.',
				})
			);

const add = Command.make(
	'add',
	{
		from: Flag.choice('from', providerChoices).pipe(
			Flag.withDescription('Provider to mint the env value from')
		),
		permission: Flag.string('permission').pipe(
			Flag.withDescription(
				'Permission to grant, e.g. "r2:write" or "s3:read@bucket/uploads"; can be repeated'
			),
			Flag.atLeast(1)
		),
	},
	({ from, permission }) =>
		Effect.gen(function* () {
			const config = getProviderConfig(from);
			const labels = config.defaultLabels.map(DotfileSecret.envLabel);
			const existing = yield* DotfileSecret.existingLabels();

			for (const envLabel of labels) {
				if (existing.has(envLabel)) {
					return yield* new HemError({
						message: `Env var "${envLabel}" is already managed. Run \`hem env rm ${envLabel}\` first.`,
					});
				}
			}

			const grants = yield* Effect.all(permission.map(parseGrant)).pipe(
				Effect.mapError(
					(error) => new HemError({ message: error.message })
				)
			);

			const issued = yield* mintFromProvider(from, {
				grants,
				permissions: [...permission],
			});

			if (issued.values.length !== labels.length) {
				return yield* new HemError({
					message: `${config.displayName} returned ${issued.values.length} credential values but ${labels.length} labels were expected.`,
				});
			}

			const vars = yield* Effect.all(
				labels.map((envLabel, index) =>
					Effect.gen(function* () {
						const value = issued.values[index];
						if (!value) {
							return yield* new HemError({
								message: `${config.displayName} did not return a value for "${envLabel}".`,
							});
						}

						const source: DotfileSecret.Source = {
							name: EnvSecret.name({
								env: envLabel,
								provider: from,
							}),
							service: EnvSecret.service,
							type: 'keychain',
						};

						yield* BunSecret.set({
							name: source.name,
							service: source.service,
							value,
						});

						return {
							id: DotfileSecret.newVarId(),
							label: envLabel,
							source,
						} satisfies DotfileSecret.Var;
					})
				),
				{ concurrency: 'unbounded' }
			);

			yield* DotfileSecret.upsert({
				expiresOn: issued.expiresOn,
				issuedOn: issued.issuedOn,
				permissions: [...permission],
				provider: from,
				tokenId: issued.id,
				vars,
			});

			yield* Console.log(
				`✓ Added ${vars.length} variable${vars.length === 1 ? '' : 's'} from ${config.displayName}`
			);
			for (const variable of vars) {
				yield* Console.log(
					`  ${variable.label.padEnd(24)} ${variable.id}`
				);
			}
		})
).pipe(Command.withDescription('Mint and store provider-backed env vars'));

const list = Command.make('list', {}, () =>
	DotfileSecret.read.pipe(
		Effect.flatMap((manifest) =>
			Effect.gen(function* () {
				if (manifest.secrets.length === 0)
					return yield* Console.log('No env vars added.');

				const headers = [
					'LABEL',
					'ID',
					'FROM',
					'PERMISSIONS',
					'EXPIRES',
				] as const;
				const rows = manifest.secrets.flatMap((entry) =>
					entry.vars.map((variable) => [
						variable.label,
						variable.id,
						entry.provider ?? '-',
						entry.permissions?.join(',') ?? '-',
						entry.expiresOn ?? '-',
					])
				);
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
			Argument.withDescription('Any label from the credential bundle')
		),
	},
	({ envName }) =>
		Effect.gen(function* () {
			const name = yield* validateEnvLabel(envName);
			const removed = yield* DotfileSecret.removeByLabel(name);

			if (!removed) {
				return yield* Console.log(
					`No env var named ${name} was found.`
				);
			}

			yield* Effect.all(
				removed.vars.map((variable) =>
					BunSecret.remove({
						name: variable.source.name,
						service: variable.source.service,
					})
				),
				{ concurrency: 'unbounded' }
			);

			const labels = removed.vars.map((variable) => variable.label);
			yield* Console.log(
				`✓ Removed ${labels.length} variable${labels.length === 1 ? '' : 's'}: ${labels.join(', ')}.`
			);
		})
).pipe(Command.withDescription('Remove a locally added env var'));

export const envCommand = Command.make('env').pipe(
	Command.withDescription('Manage local provider-backed env vars'),
	Command.withSubcommands([add, list, rm])
);
