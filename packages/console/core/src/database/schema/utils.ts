import { integer, text } from 'drizzle-orm/sqlite-core';

export const id = (prefix: string) =>
	text('id')
		.primaryKey()
		.$defaultFn(() => `${prefix}_${crypto.randomUUID()}`);

export const timestamps = {
	createdAt: integer('created_at', { mode: 'timestamp_ms' })
		.notNull()
		.$defaultFn(() => new Date()),
	updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
		.notNull()
		.$defaultFn(() => new Date())
		.$onUpdate(() => new Date()),
};
