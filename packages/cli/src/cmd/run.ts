import { Console, Effect } from 'effect';

import { DotfileSecret } from '../dotfile/secret';
import { BunSecret } from '../secret/bun';
import { HemError } from '../util/error';

const resolveSecret = (entry: DotfileSecret.Entry) =>
	Effect.gen(function* () {
		const value = yield* BunSecret.get({
			name: entry.source.name,
			service: entry.source.service,
		});

		if (!value) {
			return yield* new HemError({
				message: `No value for "${entry.env}" in the system keychain.${
					entry.provider === 'cloudflare'
						? ` Run \`hem env add ${entry.env} --from cloudflare --permission <permission>\` first.`
						: ''
				}`,
			});
		}

		if (entry.expiresOn && Date.parse(entry.expiresOn) < Date.now()) {
			yield* Console.warn(
				`! "${entry.env}" expired on ${entry.expiresOn}. Re-mint it before relying on this run.`
			);
		}

		return [entry.env, value] as const;
	});

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
		const manifest = yield* DotfileSecret.read;
		const manifestEnv = yield* Effect.all(
			manifest.secrets.map(resolveSecret),
			{
				concurrency: 'unbounded',
			}
		);

		yield* spawnCommand({
			args,
			env: {
				...process.env,
				...Object.fromEntries(manifestEnv),
			},
		});
	});
