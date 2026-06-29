import { eq } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

import { Database, DbError } from './database/database';
import { BindingTable } from './database/schema/binding.sql';
import { fn } from './util/fn';

const BindingCreate = Schema.Struct({
	installationId: Schema.String,
});

export namespace Binding {
	export const create = fn(BindingCreate, (values) =>
		Effect.gen(function* () {
			const { db } = yield* Database.Service;
			const row = yield* Effect.tryPromise({
				catch: (cause) => new DbError({ cause }),
				try: async () =>
					(
						await db.insert(BindingTable).values(values).returning()
					)[0],
			});
			if (!row)
				{return yield* Effect.fail(
					new DbError({
						cause: new Error('Binding insert returned no row.'),
					})
				);}
			return row;
		})
	);

	export const fromId = fn(Schema.String, (id) =>
		Effect.gen(function* () {
			const { db } = yield* Database.Service;
			return yield* Effect.tryPromise({
				catch: (cause) => new DbError({ cause }),
				try: async () =>
					(
						await db
							.select()
							.from(BindingTable)
							.where(eq(BindingTable.id, id))
					)[0],
			});
		})
	);
}
