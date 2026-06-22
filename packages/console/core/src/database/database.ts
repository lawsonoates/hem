import { Database as BunDatabase } from 'bun:sqlite';

import { drizzle } from 'drizzle-orm/bun-sqlite';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { Config, Context, Data, Effect, Layer } from 'effect';

import * as authSchema from './schema/auth.sql';
import * as bindingSchema from './schema/binding.sql';
import * as installationSchema from './schema/installation.sql';

const migrationsFolder = decodeURIComponent(
	new URL('./migrations', import.meta.url).pathname
);

const schema = {
	...authSchema,
	...bindingSchema,
	...installationSchema,
};

type HemSchema = typeof authSchema &
	typeof bindingSchema &
	typeof installationSchema;

export type HemDatabase = BunSQLiteDatabase<HemSchema>;

export interface Interface {
	readonly db: HemDatabase;
}

export class Service extends Context.Service<Service, Interface>()(
	'@hem/console-core/Database'
) {}

const acquire = (path: string) =>
	Effect.acquireRelease(
		Effect.sync(() => {
			const sqlite = new BunDatabase(path, { create: true });
			sqlite.run('PRAGMA journal_mode = WAL');
			sqlite.run('PRAGMA foreign_keys = ON');
			const db = drizzle(sqlite, { schema });
			migrate(db, { migrationsFolder });
			return db;
		}),
		(db) => Effect.sync(() => db.$client.close())
	);

export const layer = Layer.effect(
	Service,
	Effect.gen(function* () {
		const path = yield* Config.string('HEM_DATABASE_PATH').pipe(
			Config.withDefault('hem.db')
		);
		const db = yield* acquire(path);
		return Service.of({ db });
	})
);

export function layerFromPath(path: string) {
	return Layer.effect(
		Service,
		Effect.gen(function* () {
			const db = yield* acquire(path);
			return Service.of({ db });
		})
	);
}

export const defaultLayer = layer;

export class DbError extends Data.TaggedError('DbError')<{
	readonly cause: unknown;
}> {}

// oxlint-disable-next-line import/no-self-import, oxc/no-barrel-file -- namespace projection for Effect service module
export * as Database from './database';