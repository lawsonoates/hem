import { createInterface } from 'node:readline/promises';

import {
	CONNECTOR_DEFAULT_OUTPUTS,
	CONNECTOR_LABELS,
	MANAGED_CONNECTORS,
} from '@hem/core/connector';
import type { ManagedConnector } from '@hem/core/connector';
import { HemError } from '@hem/core/error';
import { envLabel, newVarId } from '@hem/core/manifest/schema';
import type { EnvLabel, Source, Var } from '@hem/core/manifest/schema';
import { Console, Effect, Option } from 'effect';
import { Argument, Command, Prompt } from 'effect/unstable/cli';

import { connectProvider } from '../control/cloud/provider';
import { Manifest } from '../manifest';
import { BunSecret } from '../secret/bun';
import { EnvSecret } from '../secret/env';

const envNamePattern = /^[A-Za-z_][A-Za-z0-9_]*$/u;

const validateEnvLabel = (name: string) =>
	envNamePattern.test(name)
		? Effect.succeed(envLabel(name))
		: Effect.fail(
				new HemError({
					message:
						'Env name must start with a letter or underscore and contain only letters, numbers, and underscores.',
				})
			);

const promptForValue = (label: EnvLabel) =>
	Effect.tryPromise({
		catch: () =>
			new HemError({
				message: `Failed to read value for "${label}".`,
			}),
		try: async () => {
			const shouldHideInput = process.stdin.isTTY;

			if (shouldHideInput) {
				Bun.spawnSync(['stty', '-echo'], {
					stderr: 'ignore',
					stdin: 'inherit',
					stdout: 'ignore',
				});
			}

			const readline = createInterface({
				input: process.stdin,
				output: process.stdout,
			});

			try {
				return await readline.question(`Value for ${label}: `);
			} finally {
				readline.close();
				if (shouldHideInput) {
					Bun.spawnSync(['stty', 'echo'], {
						stderr: 'ignore',
						stdin: 'inherit',
						stdout: 'ignore',
					});
					process.stdout.write('\n');
				}
			}
		},
	}).pipe(
		Effect.flatMap((value) =>
			value && value.length > 0
				? Effect.succeed(value)
				: Effect.fail(
						new HemError({
							message: `No value provided for "${label}".`,
						})
					)
		)
	);

const addManual = (envName: string) =>
	Effect.gen(function* () {
		const bunSecret = yield* BunSecret.Service;
		const manifest = yield* Manifest.Service;
		const label = yield* validateEnvLabel(envName);
		const existing = yield* manifest.existingLabels();

		if (existing.has(label)) {
			return yield* new HemError({
				message: `Env var "${label}" is already managed. Run \`hem env rm ${label}\` first.`,
			});
		}

		const value = yield* promptForValue(label);
		const source: Source = {
			name: EnvSecret.manualName(label),
			service: EnvSecret.service,
			type: 'keychain',
		};
		const variable: Var = {
			id: newVarId(),
			label,
			source,
		};

		yield* bunSecret.set({
			name: source.name,
			service: source.service,
			value,
		});

		yield* manifest.upsert({
			vars: [variable],
		});

		yield* Console.log(`✓ Added ${label}`);
	});

const promptForManualName = Prompt.text({
	message: 'Env var name',
	validate: (name) =>
		envNamePattern.test(name)
			? Effect.succeed(name)
			: Effect.fail(
					'Env name must start with a letter or underscore and contain only letters, numbers, and underscores.'
				),
});

const connectorChoice = (connector: ManagedConnector) => ({
	description: `Connect ${CONNECTOR_LABELS[connector]} for ${CONNECTOR_DEFAULT_OUTPUTS[connector].join(', ')}`,
	title: `${CONNECTOR_LABELS[connector]} connector`,
	value: connector,
});

const addInteractively = Effect.gen(function* () {
	const source = yield* Prompt.run(
		Prompt.select({
			choices: [
				...MANAGED_CONNECTORS.map(connectorChoice),
				{
					description: 'Store a named value in the local keychain',
					title: 'Manual token',
					value: 'manual' as const,
				},
			],
			message: 'What would you like to add?',
		})
	);

	if (source !== 'manual') return yield* connectProvider(source);

	const envName = yield* Prompt.run(promptForManualName);
	return yield* addManual(envName);
});

const add = Command.make(
	'add',
	{
		envName: Argument.string('name').pipe(
			Argument.withDescription('Env var name to add manually'),
			Argument.optional
		),
	},
	({ envName }) =>
		Option.match(envName, {
			onNone: () => addInteractively,
			onSome: addManual,
		})
).pipe(Command.withDescription('Add a connector or manual env var'));

const list = Command.make('list', {}, () =>
	Effect.gen(function* () {
		const manifest = yield* Manifest.Service;
		const data = yield* manifest.read();
		if (data.secrets.length === 0 && (data.bindings?.length ?? 0) === 0)
			return yield* Console.log('No env vars added.');

		const headers = ['LABEL', 'ID', 'FROM', 'EXPIRES'] as const;
		const rows = [
			...data.secrets.flatMap((entry) =>
				entry.vars.map((variable) => [
					variable.label,
					variable.id,
					entry.provider ?? 'manual',
					entry.expiresOn ?? '-',
				])
			),
			...(data.bindings ?? []).flatMap((binding) =>
				binding.outputs.map((output) => [
					output,
					binding.bindingId.replace(/^bind_/u, ''),
					binding.connector,
					'-',
				])
			),
		];
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
			const bunSecret = yield* BunSecret.Service;
			const manifest = yield* Manifest.Service;
			const name = yield* validateEnvLabel(envName);
			const removed = yield* manifest.removeByLabel(name);

			if (removed) {
				yield* Effect.all(
					removed.vars.map((variable) =>
						bunSecret.remove({
							name: variable.source.name,
							service: variable.source.service,
						})
					),
					{ concurrency: 'unbounded' }
				);

				const labels = removed.vars.map((variable) => variable.label);
				return yield* Console.log(
					`✓ Removed ${labels.length} variable${labels.length === 1 ? '' : 's'}: ${labels.join(', ')}.`
				);
			}

			const removedBinding =
				yield* manifest.removeManagedBindingByOutput(name);
			if (!removedBinding) {
				return yield* Console.log(
					`No env var named ${name} was found.`
				);
			}

			const labels = removedBinding.outputs;
			yield* Console.log(
				`✓ Removed ${labels.length} variable${labels.length === 1 ? '' : 's'}: ${labels.join(', ')}.`
			);
		})
).pipe(Command.withDescription('Remove a locally added env var'));

export const envCommand = Command.make('env').pipe(
	Command.withDescription('Manage local env vars'),
	Command.withSubcommands([add, list, rm])
);
