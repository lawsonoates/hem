import { Context, Effect, Layer } from 'effect';
import { HttpServerRequest } from 'effect/unstable/http';
import { HttpApiMiddleware, HttpApiSecurity } from 'effect/unstable/httpapi';

import { HemAuth } from '../auth';
import { Unauthorized } from '../errors';
import { HemUserId } from '../schema';

export interface Principal {
	readonly id: HemUserId;
}

export class CurrentUser extends Context.Service<CurrentUser, Principal>()(
	'@hem/console-api/CurrentUser'
) {}

export class Authorization extends HttpApiMiddleware.Service<
	Authorization,
	{ provides: CurrentUser }
>()('@hem/console-api/Authorization', {
	error: Unauthorized,
	requiredForClient: true,
	security: { bearer: HttpApiSecurity.bearer },
}) {}

export const AuthorizationLive = Layer.effect(
	Authorization,
	Effect.gen(function* () {
		const auth = yield* HemAuth.Service;
		return Authorization.of({
			bearer: Effect.fn(function* (httpEffect) {
				const request = yield* HttpServerRequest.HttpServerRequest;
				const session = yield* Effect.tryPromise({
					catch: () =>
						new Unauthorized({
							message: 'Missing or invalid bearer token.',
						}),
					try: () =>
						auth.api.getSession({
							headers: new Headers(request.headers),
						}),
				});
				if (!session) {
					return yield* new Unauthorized({
						message: 'Missing or invalid bearer token.',
					});
				}
				return yield* Effect.provideService(httpEffect, CurrentUser, {
					id: HemUserId.make(session.user.id),
				});
			}),
		});
	})
);
