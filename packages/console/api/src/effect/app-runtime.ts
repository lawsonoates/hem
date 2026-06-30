import { Database } from '@hem/console-core/database/database';
import { Layer, ManagedRuntime } from 'effect';
import { HttpApiBuilder } from 'effect/unstable/httpapi';

import { HemApi } from '../api';
import { HemAuth } from '../auth';
import { ConnectorRegistry } from '../connectors/registry';
import { AuthorizationLive } from '../middleware/auth';
import { HandlersLive } from '../routes';

export const ServicesLayer = Layer.mergeAll(
	ConnectorRegistry.defaultLayer,
	HemAuth.defaultLayer
).pipe(Layer.provideMerge(Database.defaultLayer));

export const ApiLayer = HttpApiBuilder.layer(HemApi).pipe(
	Layer.provide(HandlersLive),
	Layer.provide(AuthorizationLive)
);

export const HttpRoutesLayer = Layer.mergeAll(ApiLayer, HemAuth.route);

export const HttpAppLayer = HttpRoutesLayer.pipe(Layer.provide(ServicesLayer));

/** Domain services for scripts, tests, and non-HTTP entrypoints. */
export const AppLayer = ServicesLayer;

const runtime = ManagedRuntime.make(AppLayer);

type Runtime = Pick<
	typeof runtime,
	'runPromise' | 'runPromiseExit' | 'runFork' | 'dispose'
>;

export type AppServices = ManagedRuntime.ManagedRuntime.Services<
	typeof runtime
>;

export const makeRuntime = <R, E>(layer: Layer.Layer<R, E>) => {
	const rt = ManagedRuntime.make(layer);
	return {
		dispose: () => rt.dispose(),
		runFork: rt.runFork.bind(rt),
		runPromise: rt.runPromise.bind(rt),
		runPromiseExit: rt.runPromiseExit.bind(rt),
	};
};

export const AppRuntime: Runtime = {
	dispose: () => runtime.dispose(),
	runFork: (effect) => runtime.runFork(effect),
	runPromise: (effect, options) => runtime.runPromise(effect, options),
	runPromiseExit: (effect, options) =>
		runtime.runPromiseExit(effect, options),
};
