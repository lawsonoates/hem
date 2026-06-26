import { CONNECTOR_DEFAULT_OUTPUTS } from '@hem/core/connector';
import { Context, Effect, Layer } from 'effect';

import { GithubConnector } from '../github';
import { ConnectorError, requireGithubInstallationId } from './types';
import type {
	CompletedConnectorInstallation,
	ManagedConnectorService,
} from './types';

export type Interface = ManagedConnectorService;

export class Service extends Context.Service<Service, Interface>()(
	'@hem/console-api/connectors/GithubManagedConnector'
) {}

export const layer = Layer.effect(
	Service,
	Effect.gen(function* () {
		const github = yield* GithubConnector.Service;

		const createAuthorizationUrl = Effect.fn(
			'GithubManagedConnector.createAuthorizationUrl'
		)((state: string) =>
			Effect.succeed(github.createInstallationUrl(state))
		);

		const completeAuthorization = Effect.fn(
			'GithubManagedConnector.completeAuthorization'
		)(function* (
			input: Parameters<
				ManagedConnectorService['completeAuthorization']
			>[0]
		) {
			const providerInstallationId = yield* requireGithubInstallationId(
				'github',
				input.callback
			);
			const completed = yield* github
				.completeInstallation(providerInstallationId)
				.pipe(
					Effect.mapError(
						(error) =>
							new ConnectorError({
								cause: error.cause,
								connector: 'github',
								message: error.message,
							})
					)
				);
			return {
				...completed,
				credentials: null,
			} satisfies CompletedConnectorInstallation;
		});

		const issueCredential = Effect.fn(
			'GithubManagedConnector.issueCredential'
		)(function* (
			input: Parameters<ManagedConnectorService['issueCredential']>[0]
		) {
			const credential = yield* github
				.issueCredential({
					providerInstallationId: input.providerInstallationId,
				})
				.pipe(
					Effect.mapError(
						(error) =>
							new ConnectorError({
								cause: error.cause,
								connector: 'github',
								message: error.message,
							})
					)
				);
			return {
				expiresAt: credential.expiresAt,
				values: { GITHUB_TOKEN: credential.token },
			};
		});

		return Service.of({
			completeAuthorization,
			connector: 'github',
			createAuthorizationUrl,
			issueCredential,
			outputsForInstallation: () => CONNECTOR_DEFAULT_OUTPUTS.github,
		});
	})
);

export const defaultLayer = layer.pipe(
	Layer.provide(GithubConnector.defaultLayer)
);

// oxlint-disable-next-line import/no-self-import, oxc/no-barrel-file -- namespace projection for Effect service module
export * as GithubManagedConnector from './github';
