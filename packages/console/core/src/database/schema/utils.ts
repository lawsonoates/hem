import { text, timestamp } from 'drizzle-orm/pg-core';

export const id = (prefix: string) =>
	text('id')
		.primaryKey()
		.$defaultFn(() => `${prefix}_${crypto.randomUUID()}`);

export const timestamps = {
	createdAt: timestamp('created_at', { withTimezone: true })
		.notNull()
		.defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true })
		.notNull()
		.defaultNow()
		.$onUpdate(() => new Date()),
};
