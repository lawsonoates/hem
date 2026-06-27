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
				return yield* Effect.try({
					catch: (cause) => new DbError({ cause }),
					try: () =>
						db
							.insert(BindingTable)
							.values(values)
							.returning()
							.get(),
				});
			})
	);

	export const fromId = fn(Schema.String, (id) =>
		Effect.gen(function* () {
			const { db } = yield* Database.Service;
			return yield* Effect.try({
				catch: (cause) => new DbError({ cause }),
				try: () =>
					db
						.select()
						.from(BindingTable)
						.where(eq(BindingTable.id, id))
						.get(),
			});
		})
	);
}
