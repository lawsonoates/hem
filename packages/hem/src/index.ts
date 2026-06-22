#!/usr/bin/env bun

import { BunRuntime } from '@effect/platform-bun';
import { Effect } from 'effect';
import { Command } from 'effect/unstable/cli';

import { connectCommand } from './cmd/connect';
import { envCommand } from './cmd/env';
import { loginCommand } from './cmd/login';
import { logoutCommand } from './cmd/logout';
import { runCommandWithInjectedSecrets } from './cmd/run';
import { CliAppLayer } from './effect/app-runtime';

const exitWithMessage = (message: string, exitCode = 1) =>
	Effect.sync(() => {
		console.error(message);
		process.exitCode = exitCode;
	});

const runMain = <A, E, R>(program: Effect.Effect<A, E, R>) =>
	BunRuntime.runMain(
		Effect.provide(program, CliAppLayer) as Effect.Effect<A, E, never>
	);

const HEM_SUBCOMMANDS = new Set(['connect', 'env', 'login', 'logout']);

const hem = Command.make('hem').pipe(
	Command.withDescription('Create, manage and use secrets.'),
	Command.withSubcommands([
		connectCommand,
		envCommand,
		loginCommand,
		logoutCommand,
	])
);

const shouldRunHemCli = (arg: string | undefined) =>
	!arg || (arg !== '--' && arg.startsWith('-')) || HEM_SUBCOMMANDS.has(arg);

const commandArgs = () =>
	process.argv[2] === '--' ? process.argv.slice(3) : process.argv.slice(2);

const runExternalCommand = () =>
	runCommandWithInjectedSecrets(commandArgs()).pipe(
		Effect.catchTags({
			BunSecretError: (e) => exitWithMessage(e.message),
			Forbidden: (e) => exitWithMessage(e.message),
			HemError: (e) => exitWithMessage(e.message, e.exitCode),
			HttpClientError: (e) => exitWithMessage(e.message),
			InvalidSecretsManifest: (e) => exitWithMessage(e.message),
			NotFound: (e) => exitWithMessage(e.message),
			PlatformError: (e: { message: string }) =>
				exitWithMessage(e.message),
			Unauthorized: (e) => exitWithMessage(e.message),
		}),
		runMain
	);

if (shouldRunHemCli(process.argv[2])) {
	Command.run(hem, { version: '0.0.1' }).pipe(
		Effect.catchTags({
			BunSecretError: (e) => exitWithMessage(e.message),
			Forbidden: (e) => exitWithMessage(e.message),
			HemError: (e) => exitWithMessage(e.message, e.exitCode),
			HttpClientError: (e) => exitWithMessage(e.message),
			InvalidAuthorization: (e) => exitWithMessage(e.message),
			InvalidSecretsManifest: (e) => exitWithMessage(e.message),
			NotFound: (e) => exitWithMessage(e.message),
			PlatformError: (e: { message: string }) =>
				exitWithMessage(e.message),
			Unauthorized: (e) => exitWithMessage(e.message),
			UserError: (e) => exitWithMessage(e.message),
		}),
		runMain
	);
} else {
	runExternalCommand();
}