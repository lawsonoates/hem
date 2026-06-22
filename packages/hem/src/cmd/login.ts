import {
	DEVICE_CLIENT_ID,
	DEVICE_GRANT,
	ExchangeDeviceTokenRequest,
	StartDeviceAuthorizationRequest,
} from '@hem/console-api/schema';
import { Console, Effect, Option } from 'effect';
import { Command } from 'effect/unstable/cli';

import { HemApiClient } from '../api/client';
import { pollUntilComplete } from '../api/poll';
import { apiBaseUrl, storeSession } from '../auth/session';
import { openBrowser } from '../auth/util';

const login = Effect.gen(function* () {
	const client = yield* HemApiClient;
	const baseUrl = yield* apiBaseUrl;
	const authorization = yield* client.auth.startDeviceAuthorization({
		payload: new StartDeviceAuthorizationRequest({
			client_id: DEVICE_CLIENT_ID,
		}),
	});

	yield* Console.log('Opening Hem to sign in…');
	yield* Console.log(`Device code: ${authorization.user_code}`);
	yield* openBrowser(authorization.verification_uri_complete);

	const token = yield* pollUntilComplete({
		attempt: client.auth
			.exchangeDeviceToken({
				payload: new ExchangeDeviceTokenRequest({
					client_id: DEVICE_CLIENT_ID,
					device_code: authorization.device_code,
					grant_type: DEVICE_GRANT,
				}),
			})
			.pipe(
				Effect.map((body) =>
					Option.some({
						accessToken: body.access_token,
						expiresAt: new Date(
							Date.now() + body.expires_in * 1000
						).toISOString(),
					})
				),
				Effect.catchTags({
					DeviceAuthorizationPending: () =>
						Effect.succeed(Option.none()),
					DeviceAuthorizationSlowDown: () =>
						Effect.succeed(Option.none()),
				})
			),
		expiresAt: new Date(
			Date.now() + authorization.expires_in * 1000
		).toISOString(),
		interval: authorization.interval,
		timeoutMessage: 'Hem sign-in expired. Run `hem login` again.',
	});
	yield* storeSession(baseUrl, token);
	yield* Console.log('✓ Signed in to Hem');
});

export const loginCommand = Command.make('login', {}, () => login).pipe(
	Command.withDescription('Sign in with Hem')
);