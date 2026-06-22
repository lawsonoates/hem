import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { user } from './auth.sql';
import { id, timestamps } from './utils';

export interface GithubAccount {
	readonly id: string;
	readonly name: string;
	readonly type: 'user' | 'organization';
}

export type GithubPermissions = Readonly<Record<string, string>>;

export const InstallationTable = sqliteTable(
	'installation',
	{
		account: text('account', { mode: 'json' })
			.$type<GithubAccount>()
			.notNull(),
		connector: text('connector', { enum: ['github'] }).notNull(),
		grantedPermissions: text('granted_permissions', {
			mode: 'json',
		})
			.$type<GithubPermissions>()
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
