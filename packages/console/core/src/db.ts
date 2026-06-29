import { SQL } from 'bun';
import { drizzle } from 'drizzle-orm/bun-sql';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import { Config, Context, Data, Effect, Layer, Redacted } from 'effect';

import * as authSchema from './database/schema/auth.sql';
import * as bindingSchema from './database/schema/binding.sql';
import * as installationSchema from './database/schema/installation.sql';

const schema = {
	...authSchema,
	...bindingSchema,
	...installationSchema,
};

type HemSchema = typeof authSchema &
	typeof bindingSchema &
	typeof installationSchema;

export type HemDatabase = PgDatabase<any, HemSchema>;

const acquirePostgresDrizzle = (url: string) =>
	Effect.acquireRelease(
		Effect.sync(() => {
			const database = new SQL({ url });
			return drizzle(database, { schema });
		}),
		(client) =>
			Effect.promise(async () => {
				await client.$client.close();
			})
	);

export class PostgresDrizzle extends Context.Service<
	PostgresDrizzle,
	HemDatabase
>()('@hem/console-core/PostgresDrizzle') {
	static readonly layer = Layer.effect(
		PostgresDrizzle,
		Effect.gen(function* () {
			const url = yield* Config.redacted('HEM_DATABASE_URL');
			return yield* acquirePostgresDrizzle(Redacted.value(url));
		})
	);
}

export class DbError extends Data.TaggedError('DbError')<{
	readonly cause: unknown;
}> {}
