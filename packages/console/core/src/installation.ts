import { and, eq, gt } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

import {
	persistProviderCredentials,
	redactProviderCredentials,
} from './credentials';
import { Database, DbError } from './database/database';
import {
	InstallationRequestTable,
	InstallationTable,
} from './database/schema/installation.sql';
import type {
	ManagedConnector,
	ProviderCredentials,
} from './database/schema/installation.sql';
import {
	InstallationRequestComplete,
	InstallationRequestCreate,
	InstallationRequestPoll,
	InstallationSave,
	InstallationUpdateCredentials,
} from './installation/commands';
import { parseInstallationRow } from './installation/parse';
import { fn } from './util/fn';

export type InstallationRow = typeof InstallationTable.$inferSelect;

export type InstallationPollResult =
	| { readonly _tag: 'Invalid' }
	| { readonly _tag: 'Pending' }
	| { readonly _tag: 'Complete'; readonly installationId: string };

export { parseInstallationRow } from './installation/parse';
export type { ParsedInstallationRow } from './installation/parse';

export namespace InstallationRequest {
	export const create = fn(InstallationRequestCreate, (values) =>
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

	export const owner = fn(Schema.String, (state) =>
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
		InstallationRequestComplete,
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
		InstallationRequestPoll,
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
	export const fromId = fn(Schema.String, (id) =>
		Effect.gen(function* () {
			const { db } = yield* Database.Service;
			const row = yield* Effect.try({
				catch: (cause) => new DbError({ cause }),
				try: () =>
					db
						.select()
						.from(InstallationTable)
						.where(eq(InstallationTable.id, id))
						.get(),
			});
			if (!row) return;
			return yield* parseInstallationRow(row);
		})
	);

	export const fromProviderId = fn(Schema.String, (providerInstallationId) =>
		Effect.gen(function* () {
			const { db } = yield* Database.Service;
			const row = yield* Effect.try({
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
			if (!row) return;
			return yield* parseInstallationRow(row);
		})
	);

	export const save = fn(InstallationSave, (values) =>
		Effect.gen(function* () {
			const { db } = yield* Database.Service;
			const persistedCredentials = values.credentials
				? persistProviderCredentials(
						redactProviderCredentials(values.credentials)
					)
				: null;
			return yield* Effect.try({
				catch: (cause) => new DbError({ cause }),
				try: () =>
					db
						.insert(InstallationTable)
						.values({
							account: values.account,
							connector: values.connector,
							credentials: persistedCredentials,
							grantedPermissions: values.grantedPermissions,
							ownerId: values.ownerId,
							providerInstallationId:
								values.providerInstallationId,
							...(values.id ? { id: values.id } : {}),
						})
						.onConflictDoUpdate({
							set: {
								account: values.account,
								credentials: persistedCredentials,
								grantedPermissions: values.grantedPermissions,
							},
							target: InstallationTable.id,
						})
						.returning()
						.get(),
			}).pipe(
				Effect.flatMap((row) => parseInstallationRow(row))
			);
		})
	);

	export const updateCredentials = fn(
		InstallationUpdateCredentials,
		(values) =>
			Effect.gen(function* () {
				const { db } = yield* Database.Service;
				const persistedCredentials =
					values.credentials === null
						? null
						: persistProviderCredentials(
								redactProviderCredentials(values.credentials)
							);
				return yield* Effect.try({
					catch: (cause) => new DbError({ cause }),
					try: () =>
						db
							.update(InstallationTable)
							.set({
								credentials: persistedCredentials,
								...(values.grantedPermissions
									? {
											grantedPermissions:
												values.grantedPermissions,
										}
									: {}),
							})
							.where(eq(InstallationTable.id, values.id))
							.returning()
							.get(),
				}).pipe(
					Effect.flatMap((row) => parseInstallationRow(row))
				);
			})
	);
}

export type ConnectorCredentials = ProviderCredentials;
export type ConnectorName = ManagedConnector;
