import { Database } from 'bun:sqlite';

import { drizzle } from 'drizzle-orm/bun-sqlite';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { Config, Context, Data, Effect, Layer } from 'effect';

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

export type HemDatabase = BunSQLiteDatabase<HemSchema>;

const acquireSqliteDrizzle = (path: string) =>
	Effect.acquireRelease(
		Effect.sync(() => {
			const database = new Database(path, { create: true });
			return drizzle(database, { schema });
		}),
		(client) => Effect.sync(() => client.$client.close())
	);

export class SqliteDrizzle extends Context.Service<
	SqliteDrizzle,
	HemDatabase
>()('@hem/console-core/SqliteDrizzle') {
	static readonly layer = Layer.effect(
		SqliteDrizzle,
		Effect.gen(function* () {
			const path = yield* Config.string('HEM_DATABASE_PATH').pipe(
				Config.withDefault('hem.db')
			);
			return yield* acquireSqliteDrizzle(path);
		})
	);
}

export const layerSqliteDrizzle = (path: string) =>
	Layer.effect(SqliteDrizzle, acquireSqliteDrizzle(path));

export class DbError extends Data.TaggedError('DbError')<{
	readonly cause: unknown;
}> {}
