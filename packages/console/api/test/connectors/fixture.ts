import { ConfigProvider, Effect, Layer } from 'effect';
import { FetchHttpClient } from 'effect/unstable/http';

export const testHttpClientLayer = (
	handler: (request: Request) => Response | Promise<Response>
) => {
	// SAFETY: test seam substitutes fetch with a local handler returning Web Responses.
	const testFetch = ((url: string | URL | Request, init?: RequestInit) => {
		const request =
			url instanceof Request ? url : new Request(url.toString(), init);
		return Promise.resolve(handler(request));
	}) as typeof globalThis.fetch;

	return FetchHttpClient.layer.pipe(
		Layer.provide(Layer.succeed(FetchHttpClient.Fetch, testFetch))
	);
};

export const runWithLayer = <A, E, R, Provided>(
	layer: Layer.Layer<R, E, Provided>,
	config: Readonly<Record<string, string>>,
	handler: (request: Request) => Response | Promise<Response>,
	effect: Effect.Effect<A, E, R>
) =>
	Effect.runPromise(
		effect.pipe(
			Effect.provide(
				layer.pipe(Layer.provide(testHttpClientLayer(handler)))
			),
			Effect.provideService(
				ConfigProvider.ConfigProvider,
				ConfigProvider.fromUnknown(config)
			)
			// SAFETY: provided layers close over the remaining environment for tests.
		) as Effect.Effect<A, E>
	);
