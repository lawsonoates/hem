import { Console, Effect, Option } from 'effect';
import { Command } from 'effect/unstable/cli';

import { signOut } from '../auth/client';
import { apiBaseUrl, clearSession, getSession } from '../auth/session';

const logout = Effect.gen(function* () {
	const baseUrl = yield* apiBaseUrl;
	const session = yield* getSession.pipe(Effect.option);
	if (Option.isSome(session)) {
		yield* signOut(session.value.accessToken).pipe(Effect.ignore);
	}
	yield* clearSession(baseUrl);

	yield* Console.log('✓ You are now logged out');
	yield* Console.log('Run hem login to log in again');
});

export const logoutCommand = Command.make('logout', {}, () => logout).pipe(
	Command.withDescription('Log out of Hem')
);
