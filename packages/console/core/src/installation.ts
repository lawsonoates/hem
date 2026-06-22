import { and, eq, gt } from 'drizzle-orm';
import { Effect } from 'effect';
import { z } from 'zod';

import { Database, DbError } from './database/database';
import {
	InstallationRequestTable,
	InstallationTable,
} from './database/schema/installation.sql';
import { fn } from './util/fn';

export type InstallationRow = typeof InstallationTable.$inferSelect;

export type InstallationPollResult =
	| { readonly _tag: 'Invalid' }
	| { readonly _tag: 'Pending' }
	| { readonly _tag: 'Complete'; readonly installationId: string };

export namespace InstallationRequest {
	export const create = fn(
		z.object({
			expiresAt: z.date(),
			ownerId: z.string(),
			state: z.string(),
		}),
		(values) =>
			Effect.gen(function* () {
				const { db } = yield* Database.Service;
				return yield* Effect.try({
					catch: (cause) => new DbError({ cause }),
					try: () =>
						db
							.insert(InstallationRequestTable)
							.values(values)
							.returning()
							.get(),
				});
			})
	);

	export const owner = fn(z.string(), (state) =>
		Effect.gen(function* () {
			const { db } = yield* Database.Service;
			return yield* Effect.try({
				catch: (cause) => new DbError({ cause }),
				try: () =>
					db
						.select({ ownerId: InstallationRequestTable.ownerId })
						.from(InstallationRequestTable)
						.where(
							and(
								eq(InstallationRequestTable.state, state),
								gt(
									InstallationRequestTable.expiresAt,
									new Date()
								)
							)
						)
						.get()?.ownerId,
			});
		})
	);

	export const complete = fn(
		z.object({ installationId: z.string(), state: z.string() }),
		({ installationId, state }) =>
			Effect.gen(function* () {
				const { db } = yield* Database.Service;
				return yield* Effect.try({
					catch: (cause) => new DbError({ cause }),
					try: () =>
						db
							.update(InstallationRequestTable)
							.set({ installationId })
							.where(eq(InstallationRequestTable.state, state))
							.run(),
				});
			})
	);

	export const poll = fn(
		z.object({ ownerId: z.string(), state: z.string() }),
		({ ownerId, state }) =>
			Effect.gen(function* () {
				const { db } = yield* Database.Service;
				return yield* Effect.try({
					catch: (cause) => new DbError({ cause }),
					try: () =>
						db.transaction(
							(transaction): InstallationPollResult => {
								const request = transaction
									.select()
									.from(InstallationRequestTable)
									.where(
										and(
											eq(
												InstallationRequestTable.state,
												state
											),
											eq(
												InstallationRequestTable.ownerId,
												ownerId
											)
										)
									)
									.get();
								if (!request || request.expiresAt <= new Date())
									return { _tag: 'Invalid' };

								if (!request.installationId)
									return { _tag: 'Pending' };
								transaction
									.delete(InstallationRequestTable)
									.where(
										eq(
											InstallationRequestTable.id,
											request.id
										)
									)
									.run();
								return {
									_tag: 'Complete',
									installationId: request.installationId,
								};
							}
						),
				});
			})
	);
}

export namespace Installation {
	export const fromId = fn(z.string(), (id) =>
		Effect.gen(function* () {
			const { db } = yield* Database.Service;
			return yield* Effect.try({
				catch: (cause) => new DbError({ cause }),
				try: () =>
					db
						.select()
						.from(InstallationTable)
						.where(eq(InstallationTable.id, id))
						.get(),
			});
		})
	);

	export const fromProviderId = fn(z.string(), (providerInstallationId) =>
		Effect.gen(function* () {
			const { db } = yield* Database.Service;
			return yield* Effect.try({
				catch: (cause) => new DbError({ cause }),
				try: () =>
					db
						.select()
						.from(InstallationTable)
						.where(
							eq(
								InstallationTable.providerInstallationId,
								providerInstallationId
							)
						)
						.get(),
			});
		})
	);

	export const save = fn(
		z.object({
			account: z.object({
				id: z.string(),
				name: z.string(),
				type: z.enum(['user', 'organization']),
			}),
			grantedPermissions: z.record(z.string(), z.string()),
			id: z.string().optional(),
			ownerId: z.string(),
			providerInstallationId: z.string(),
		}),
		(values) =>
			Effect.gen(function* () {
				const { db } = yield* Database.Service;
				return yield* Effect.try({
					catch: (cause) => new DbError({ cause }),
					try: () =>
						db
							.insert(InstallationTable)
							.values({ ...values, connector: 'github' })
							.onConflictDoUpdate({
								set: {
									account: values.account,
									grantedPermissions:
										values.grantedPermissions,
								},
								target: InstallationTable.id,
							})
							.returning()
							.get(),
				});
			})
	);
}
