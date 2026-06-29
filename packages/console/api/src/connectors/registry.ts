import { CONNECTOR_DEFAULT_OUTPUTS } from '@hem/core/connector';
import type { ManagedConnector } from '@hem/core/connector';
import { Context, Effect, Layer } from 'effect';

import { GithubConnector } from './github';
import { NotionConnector } from './notion';
import { PlanetScaleConnector } from './planetscale';
import { SlackConnector } from './slack';
import { requireGithubInstallationId } from './types';
import type {
	CompletedConnectorInstallation,
	ManagedConnectorService,
} from './types';
import { VercelConnector } from './vercel';

export interface Interface {
	readonly get: (
		connector: ManagedConnector
	) => Effect.Effect<ManagedConnectorService>;
}

export class Service extends Context.Service<Service, Interface>()(
	'@hem/console-api/ConnectorRegistry'
) {}

export const layer = Layer.effect(
	Service,
	Effect.gen(function* () {
		const githubConnector = yield* GithubConnector.Service;

		const github = {
			completeAuthorization: Effect.fn(
				'ConnectorRegistry.github.completeAuthorization'
			)(function* (
				input: Parameters<
					ManagedConnectorService['completeAuthorization']
				>[0]
			) {
				const providerInstallationId =
					yield* requireGithubInstallationId(
						'github',
						input.callback
					);
				const completed = yield* githubConnector.completeInstallation(
					providerInstallationId
				);
				return {
					account: completed.account,
					credentials: null,
					grantedPermissions: completed.grantedPermissions,
					providerInstallationId: completed.providerInstallationId,
				} satisfies CompletedConnectorInstallation;
			}),
			connector: 'github' as const,
			createAuthorizationUrl: Effect.fn(
				'ConnectorRegistry.github.createAuthorizationUrl'
			)((state: string) =>
				Effect.succeed(githubConnector.createInstallationUrl(state))
			),
			issueCredential: Effect.fn(
				'ConnectorRegistry.github.issueCredential'
			)(function* (
				input: Parameters<ManagedConnectorService['issueCredential']>[0]
			) {
				const credential = yield* githubConnector.issueCredential({
					providerInstallationId: input.providerInstallationId,
				});
				return {
					expiresAt: credential.expiresAt,
					values: { GITHUB_TOKEN: credential.token },
				};
			}),
			outputsForInstallation: () => CONNECTOR_DEFAULT_OUTPUTS.github,
		} satisfies ManagedConnectorService;
		const notion = yield* NotionConnector.Service;
		const planetscale = yield* PlanetScaleConnector.Service;
		const slack = yield* SlackConnector.Service;
		const vercel = yield* VercelConnector.Service;
		const connectors = {
			github,
			notion,
			planetscale,
			slack,
			vercel,
		} as const satisfies Record<ManagedConnector, ManagedConnectorService>;

		const get = Effect.fn('ConnectorRegistry.get')(
			(connector: ManagedConnector) =>
				Effect.succeed(connectors[connector])
		);

		return Service.of({ get });
	})
);

const ConnectorLayers = Layer.mergeAll(
	GithubConnector.defaultLayer,
	NotionConnector.defaultLayer,
	PlanetScaleConnector.defaultLayer,
	SlackConnector.defaultLayer,
	VercelConnector.defaultLayer
);

export const defaultLayer = layer.pipe(Layer.provide(ConnectorLayers));

// oxlint-disable-next-line import/no-self-import, oxc/no-barrel-file -- namespace projection for Effect service module
export * as ConnectorRegistry from './registry';
