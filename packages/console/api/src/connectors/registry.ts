import type { ManagedConnector } from '@hem/core/connector';
import { Context, Effect, Layer } from 'effect';
import { FetchHttpClient } from 'effect/unstable/http';

import { GithubManagedConnector } from './github';
import { NotionConnector } from './notion';
import { PlanetScaleConnector } from './planetscale';
import { SlackConnector } from './slack';
import type { ManagedConnectorService } from './types';
import { VercelConnector } from './vercel';

export interface Interface {
	readonly get: (
		connector: ManagedConnector
	) => Effect.Effect<ManagedConnectorService>;
}

export class Service extends Context.Service<Service, Interface>()(
	'@hem/console-api/connectors/ConnectorRegistry'
) {}

export const layer = Layer.effect(
	Service,
	Effect.gen(function* () {
		const github = yield* GithubManagedConnector.Service;
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
	GithubManagedConnector.defaultLayer,
	NotionConnector.defaultLayer,
	PlanetScaleConnector.defaultLayer,
	SlackConnector.defaultLayer,
	VercelConnector.defaultLayer
);

export const defaultLayer = layer.pipe(
	Layer.provide(ConnectorLayers),
	Layer.provide(FetchHttpClient.layer)
);

// oxlint-disable-next-line import/no-self-import, oxc/no-barrel-file -- namespace projection for Effect service module
export * as ConnectorRegistry from './registry';
