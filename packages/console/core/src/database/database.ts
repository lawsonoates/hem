import { SQL } from 'bun';
import { drizzle } from 'drizzle-orm/bun-sql';
import { migrate } from 'drizzle-orm/bun-sql/migrator';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import { Config, Context, Effect, Layer, Redacted, Schema } from 'effect';

import * as authSchema from './schema/auth.sql';
import * as bindingSchema from './schema/binding.sql';
import * as installationSchema from './schema/installation.sql';

const migrationsFolder = decodeURIComponent(
	new URL('migrations', import.meta.url).pathname
);

export const schema = {
	...authSchema,
	...bindingSchema,
	...installationSchema,
};

type HemSchema = typeof authSchema &
	typeof bindingSchema &
	typeof installationSchema;

export type HemDatabase = PgDatabase<any, HemSchema>;

export interface Interface {
	readonly db: HemDatabase;
}

export class Service extends Context.Service<Service, Interface>()(
	'@hem/console-core/Database'
) {}

const acquire = (url: string) =>
	Effect.acquireRelease(
		Effect.promise(async () => {
			const client = new SQL({ url });
			const db = drizzle(client, { schema });
			await migrate(db, { migrationsFolder });
			return db;
		}),
		(db) =>
			Effect.promise(async () => {
				await db.$client.close();
			})
	);

export const layer = Layer.effect(
	Service,
	Effect.gen(function* () {
		const url = yield* Config.redacted('HEM_DATABASE_URL');
		const db = yield* acquire(Redacted.value(url));
		return Service.of({ db });
	})
);

const acquirePglite = (dataDir?: string) =>
	Effect.acquireRelease(
		Effect.promise(async () => {
			const [{ PGlite }, { drizzle: drizzlePglite }, { migrate }] =
				await Promise.all([
					import('@electric-sql/pglite'),
					import('drizzle-orm/pglite'),
					import('drizzle-orm/pglite/migrator'),
				]);
			const client = dataDir ? new PGlite(dataDir) : new PGlite();
			await client.waitReady;
			const db = drizzlePglite(client, { schema });
			await migrate(db, { migrationsFolder });
			return db;
		}),
		(db) =>
			Effect.promise(async () => {
				await db.$client.close();
			})
	);

export const testLayer = Layer.effect(
	Service,
	Effect.gen(function* () {
		const db = yield* acquirePglite();
		return Service.of({ db });
	})
);

export const defaultLayer = layer;

export class DbError extends Schema.TaggedErrorClass<DbError>()(
	'DbError',
	{ cause: Schema.Defect },
	{ httpApiStatus: 500 }
) {}

// oxlint-disable-next-line import/no-self-import, oxc/no-barrel-file -- namespace projection for Effect service module
export * as Database from './database';
