import { BunHttpServer, BunRuntime } from '@effect/platform-bun';
import { Config, Effect, Layer } from 'effect';
import { HttpRouter, HttpServerResponse } from 'effect/unstable/http';

import { deviceAuthorizationPage } from './device-page';
import { ApiLayer, ServicesLayer } from './effect/app-runtime';

const AppLive = Layer.mergeAll(
	ApiLayer,
	HttpRouter.use((router) =>
		Effect.gen(function* () {
			yield* router.add(
				'GET',
				'/device',
				HttpServerResponse.html(deviceAuthorizationPage)
			);
		})
	)
);

const ServerLive = HttpRouter.serve(AppLive).pipe(
	Layer.provide(
		BunHttpServer.layerConfig({
			hostname: Config.string('HOST').pipe(Config.withDefault('0.0.0.0')),
			port: Config.port('PORT').pipe(Config.withDefault(3000)),
		})
	)
);

BunRuntime.runMain(
	Layer.launch(
		ServerLive.pipe(Layer.provide(ServicesLayer))
	) as unknown as Effect.Effect<void>
);