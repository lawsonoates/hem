import { eq } from 'drizzle-orm';
import { Effect } from 'effect';
import { z } from 'zod';

import { Database, DbError } from './database/database';
import { BindingTable } from './database/schema/binding.sql';
import { fn } from './util/fn';

export namespace Binding {
	export const create = fn(
		z.object({
			installationId: z.string(),
		}),
		(values) =>
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

	export const fromId = fn(z.string(), (id) =>
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
