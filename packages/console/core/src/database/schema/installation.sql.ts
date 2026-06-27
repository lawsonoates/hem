import {
	MANAGED_CONNECTORS,
	type ManagedConnector,
	type ProviderAccountType,
	type ProviderCredentials,
} from '@hem/core/connector';
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { user } from './auth.sql';
import { id, timestamps } from './utils';

export type { ManagedConnector, ProviderCredentials } from '@hem/core/connector';

export interface ProviderAccount {
	readonly id: string;
	readonly name: string;
	readonly type: ProviderAccountType;
}

export type ConnectorPermissions = Readonly<Record<string, string>>;

export const InstallationTable = sqliteTable(
	'installation',
	{
		account: text('account', { mode: 'json' })
			.$type<ProviderAccount>()
			.notNull(),
		connector: text('connector', {
			enum: MANAGED_CONNECTORS as unknown as [string, ...string[]],
		})
			.$type<ManagedConnector>()
			.notNull(),
		credentials: text('credentials', {
			mode: 'json',
		}).$type<ProviderCredentials | null>(),
		grantedPermissions: text('granted_permissions', {
			mode: 'json',
		})
			.$type<ConnectorPermissions>()
			.notNull(),
		id: id('ins'),
		ownerId: text('owner_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		providerInstallationId: text('provider_installation_id')
			.notNull()
			.unique(),
		...timestamps,
	},
	(table) => [index('installation_owner_id_idx').on(table.ownerId)]
);

export const InstallationRequestTable = sqliteTable(
	'installation_request',
	{
		expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
		id: id('install'),
		installationId: text('installation_id').references(
			() => InstallationTable.id,
			{ onDelete: 'set null' }
		),
		ownerId: text('owner_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		state: text('state').notNull().unique(),
		...timestamps,
	},
	(table) => [index('installation_request_owner_id_idx').on(table.ownerId)]
);