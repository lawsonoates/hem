import { MANAGED_CONNECTORS } from '@hem/core/connector';
import type {
	ManagedConnector,
	ProviderAccountType,
	ProviderCredentials,
} from '@hem/core/connector';
import { index, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

import { user } from './auth.sql';
import { id, timestamps } from './utils';

export type {
	ManagedConnector,
	ProviderCredentials,
} from '@hem/core/connector';

export interface ProviderAccount {
	readonly id: string;
	readonly name: string;
	readonly type: ProviderAccountType;
}

export type ConnectorPermissions = Readonly<Record<string, string>>;

export const InstallationTable = pgTable(
	'installation',
	{
		account: jsonb('account').$type<ProviderAccount>().notNull(),
		connector: text('connector', {
			enum: MANAGED_CONNECTORS as unknown as [string, ...string[]],
		})
			.$type<ManagedConnector>()
			.notNull(),
		credentials: jsonb('credentials').$type<ProviderCredentials | null>(),
		grantedPermissions: jsonb('granted_permissions')
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

export const InstallationRequestTable = pgTable(
	'installation_request',
	{
		expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
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
