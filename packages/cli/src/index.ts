#!/usr/bin/env bun

import { BunRuntime, BunServices } from '@effect/platform-bun';
import { Effect } from 'effect';
import { Command } from 'effect/unstable/cli';

import { connectCommand } from './cmd/connect';
import { envCommand } from './cmd/env';
import { runCommandWithInjectedSecrets } from './cmd/run';
import { exitWithMessage } from './util/error';

const HEM_SUBCOMMANDS = new Set(['connect', 'env']);

const hem = Command.make('hem').pipe(
	Command.withDescription('Run commands with Hem-managed env vars'),
	Command.withSubcommands([connectCommand, envCommand])
);

const shouldRunHemCli = (arg: string | undefined) =>
	!arg || (arg !== '--' && arg.startsWith('-')) || HEM_SUBCOMMANDS.has(arg);

const commandArgs = () =>
	process.argv[2] === '--' ? process.argv.slice(3) : process.argv.slice(2);

const runExternalCommand = () =>
	runCommandWithInjectedSecrets(commandArgs()).pipe(
		Effect.catchTags({
			BunSecretError: (e) => exitWithMessage(e.message),
			HemError: (e) => exitWithMessage(e.message, e.exitCode),
			InvalidSecretsManifest: (e) => exitWithMessage(e.message),
			PlatformError: (e) => exitWithMessage(e.message),
		}),
		Effect.provide(BunServices.layer),
		BunRuntime.runMain
	);

if (shouldRunHemCli(process.argv[2])) {
	Command.run(hem, { version: '0.0.1' }).pipe(
		Effect.catchTags({
			BunSecretError: (e) => exitWithMessage(e.message),
			HemError: (e) => exitWithMessage(e.message, e.exitCode),
			InvalidSecretsManifest: (e) => exitWithMessage(e.message),
			PlatformError: (e) => exitWithMessage(e.message),
			ProviderAuthError: (e) =>
				exitWithMessage(
					`${e.provider} rejected the credentials: ${e.message}. Run \`hem connect ${e.provider}\` to update them.`
				),
			ProviderRateLimitError: (e) =>
				exitWithMessage(
					`${e.provider} rate limit hit: ${e.message}. Try again shortly.`
				),
			ProviderRequestError: (e) =>
				exitWithMessage(
					`${e.provider} rejected the request: ${e.message}`
				),
			ProviderResponseError: (e) =>
				exitWithMessage(
					`${e.provider} returned an unexpected response: ${e.message}`
				),
			ProviderUnavailableError: (e) =>
				exitWithMessage(`${e.provider} is unavailable: ${e.message}`),
			UserError: (e) => exitWithMessage(e.message),
		}),
		Effect.provide(BunServices.layer),
		BunRuntime.runMain
	);
} else {
	runExternalCommand();
}
