import { Console, Effect, Option } from 'effect';
import { Command } from 'effect/unstable/cli';

import { HemApiClient, withAccessToken } from '../api/client';
import { apiBaseUrl, clearSession, getSession } from '../auth/session';

const logout = Effect.gen(function* () {
	const baseUrl = yield* apiBaseUrl;
	const session = yield* getSession.pipe(Effect.option);
	if (Option.isSome(session)) {
		const client = yield* HemApiClient;
		yield* withAccessToken(
			session.value.accessToken,
			client.auth.signOut({})
		).pipe(Effect.ignore);
	}
	yield* clearSession(baseUrl);

	yield* Console.log('✓ You are now logged out');
	yield* Console.log('Run hem login to log in again');
});

export const logoutCommand = Command.make('logout', {}, () => logout).pipe(
	Command.withDescription('Log out of Hem')
);
