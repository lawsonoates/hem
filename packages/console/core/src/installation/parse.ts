import {
	parseProviderAccount,
	parseProviderCredentials,
} from '@hem/core/connector';
import type {
	ManagedConnector,
	ProviderAccount,
	ProviderAccountType,
	ProviderCredentials,
} from '@hem/core/connector';
import { Effect } from 'effect';

import { DbError } from '../database/database';
import type { InstallationTable } from '../database/schema/installation.sql';

type InstallationRow = typeof InstallationTable.$inferSelect;

export type { ProviderAccount, ProviderAccountType, ProviderCredentials };

/**
 * Parsed installation row safe for application use.
 */
export interface ParsedInstallationRow {
	readonly account: ProviderAccount;
	readonly connector: ManagedConnector;
	readonly createdAt: Date;
	readonly credentials: ProviderCredentials | null;
	readonly grantedPermissions: Readonly<Record<string, string>>;
	readonly id: string;
	readonly ownerId: string;
	readonly providerInstallationId: string;
	readonly updatedAt: Date;
}

const parseRowField = <A, E>(
	parse: (input: unknown) => Effect.Effect<A, E>,
	value: unknown,
	field: string
) =>
	parse(value).pipe(
		Effect.mapError(
			(cause) =>
				new DbError({
					cause: new Error(
						`Installation row field "${field}" failed parsing.`,
						{ cause }
					),
				})
		)
	);

/**
 * Parses a raw installation row from the persistence seam.
 */
export const parseInstallationRow = (row: InstallationRow) =>
	Effect.gen(function* () {
		const account = yield* parseRowField(
			parseProviderAccount,
			row.account,
			'account'
		);
		const credentials =
			row.credentials === null || row.credentials === undefined
				? null
				: yield* parseRowField(
						parseProviderCredentials,
						row.credentials,
						'credentials'
					);
		return {
			account,
			connector: row.connector,
			createdAt: row.createdAt,
			credentials,
			grantedPermissions: row.grantedPermissions,
			id: row.id,
			ownerId: row.ownerId,
			providerInstallationId: row.providerInstallationId,
			updatedAt: row.updatedAt,
		} satisfies ParsedInstallationRow;
	});
