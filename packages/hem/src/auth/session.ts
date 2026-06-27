import { HemError } from '@hem/core/error';
import { Path as GlobalPath } from '@hem/core/global';
import { Config, Effect, FileSystem, Schema } from 'effect';

const StoredSession = Schema.Struct({
	accessToken: Schema.String,
	expiresAt: Schema.String,
});
export type StoredSession = typeof StoredSession.Type;

const StoredSessions = Schema.Record(Schema.String, StoredSession);

export const apiBaseUrl = Effect.gen(function* () {
	const configured = yield* Config.string('HEM_API_URL').pipe(
		Config.withDefault('http://127.0.0.1:3000')
	);
	return yield* Effect.try({
		catch: () =>
			new HemError({
				message: `HEM_API_URL is not a valid URL: ${configured}`,
			}),
		try: () => new URL(configured).origin,
	});
});

const readSessions = Effect.gen(function* () {
	const fs = yield* FileSystem.FileSystem;
	if (!(yield* fs.exists(GlobalPath.auth))) return {};

	const content = yield* fs.readFileString(GlobalPath.auth);
	return yield* Schema.decodeEffect(
		Schema.fromJsonString(StoredSessions)
	)(content).pipe(
		Effect.mapError(
			() =>
				new HemError({
					message:
						'Your saved Hem session is invalid. Run `hem login` again.',
				})
		)
	);
});

const writeSessions = (sessions: Record<string, StoredSession>) =>
	Effect.gen(function* () {
		const fs = yield* FileSystem.FileSystem;
		yield* fs.makeDirectory(GlobalPath.data, { recursive: true });
		yield* fs.writeFileString(
			GlobalPath.auth,
			`${JSON.stringify(sessions, null, 2)}\n`
		);
	});

export const storeSession = (baseUrl: string, session: StoredSession) =>
	Effect.gen(function* () {
		const sessions = yield* readSessions;
		yield* writeSessions({ ...sessions, [baseUrl]: session });
	});

export const clearSession = (baseUrl: string) =>
	Effect.gen(function* () {
		const sessions = yield* readSessions;
		const { [baseUrl]: _, ...rest } = sessions;
		if (Object.keys(rest).length === 0) {
			const fs = yield* FileSystem.FileSystem;
			if (yield* fs.exists(GlobalPath.auth))
				yield* fs.remove(GlobalPath.auth);
			return;
		}
		yield* writeSessions(rest);
	});

export const getSession = Effect.gen(function* () {
	const baseUrl = yield* apiBaseUrl;
	const sessions = yield* readSessions;
	const session = sessions[baseUrl];
	if (!session) {
		return yield* new HemError({
			message: 'You are not signed in to Hem. Run `hem login` first.',
		});
	}

	if (Date.parse(session.expiresAt) <= Date.now()) {
		return yield* new HemError({
			message: 'Your Hem session has expired. Run `hem login` again.',
		});
	}
	return { baseUrl, ...session };
});
