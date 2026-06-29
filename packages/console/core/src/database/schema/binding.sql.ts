import { index, pgTable, text } from 'drizzle-orm/pg-core';

import { InstallationTable } from './installation.sql';
import { id, timestamps } from './utils';

export const BindingTable = pgTable(
	'binding',
	{
		id: id('bind'),
		installationId: text('installation_id')
			.notNull()
			.references(() => InstallationTable.id, { onDelete: 'cascade' }),
		...timestamps,
	},
	(table) => [index('binding_installation_id_idx').on(table.installationId)]
);
