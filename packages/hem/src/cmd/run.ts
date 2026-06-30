import { HemError } from '@hem/core/error';
import { Effect } from 'effect';

import { resolveManagedBindings } from '../connector/cloud/lease';
import { Manifest } from '../manifest';
import { resolveEntry } from '../manifest/resolve';

const spawnCommand = (input: {
	readonly args: readonly string[];
	readonly env: Record<string, string | undefined>;
}) =>
	Effect.gen(function* () {
		if (input.args.length === 0) {
			return yield* new HemError({
				message: 'No command provided. Usage: hem <command> [...args]',
			});
		}

		const exitCode = yield* Effect.tryPromise({
			catch: () =>
				new HemError({
					message: 'Failed to run command',
				}),
			try: () =>
				Bun.spawn([...input.args], {
					cwd: process.cwd(),
					env: input.env,
					stderr: 'inherit',
					stdin: 'inherit',
					stdout: 'inherit',
				}).exited,
		});

		if (exitCode !== 0) {
			yield* Effect.sync(() => {
				process.exitCode = exitCode;
			});
		}
	});

export const runCommandWithInjectedSecrets = (args: readonly string[]) =>
	Effect.gen(function* () {
		const manifest = yield* Manifest.Service;
		const data = yield* manifest.read();
		const manifestEnv = yield* Effect.all(
			data.secrets.map((entry) => resolveEntry(entry)),
			{
				concurrency: 'unbounded',
			}
		);
		const managedEnv = yield* resolveManagedBindings(data.bindings ?? []);

		yield* spawnCommand({
			args,
			env: {
				...process.env,
				...Object.fromEntries(manifestEnv.flat()),
				...Object.fromEntries(managedEnv),
			},
		});
	});
