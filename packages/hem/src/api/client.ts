import { HemApi } from '@hem/console-api/api';
import { Authorization } from '@hem/console-api/middleware/auth';
import { Context, Effect, Layer } from 'effect';
import { HttpClientRequest } from 'effect/unstable/http';
import { HttpApiClient, HttpApiMiddleware } from 'effect/unstable/httpapi';

import { apiBaseUrl } from '../auth/session';

export type HemApiClientService = HttpApiClient.ForApi<typeof HemApi>;

export class HemApiClient extends Context.Service<
	HemApiClient,
	HemApiClientService
>()('@hem/hem/HemApiClient') {}

export class AccessToken extends Context.Service<AccessToken, string>()(
	'@hem/hem/AccessToken'
) {}

export const withAccessToken = <A, E, R>(
	accessToken: string,
	effect: Effect.Effect<A, E, R>
) => Effect.provideService(effect, AccessToken, accessToken);

const AuthorizationClient = HttpApiMiddleware.layerClient(
	Authorization,
	Effect.fn(function* ({ next, request }) {
		const token = yield* AccessToken;
		return yield* next(HttpClientRequest.bearerToken(request, token));
	})
);

const layerHemApiClientFor = (baseUrl: string) =>
	Layer.effect(HemApiClient, HttpApiClient.make(HemApi, { baseUrl })).pipe(
		Layer.provide(AuthorizationClient)
	);

export const layerHemApiClient = Layer.unwrap(
	Effect.gen(function* () {
		const baseUrl = yield* apiBaseUrl;
		return layerHemApiClientFor(baseUrl);
	})
);
