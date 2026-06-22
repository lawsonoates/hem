import { defineConfig } from 'drizzle-kit';

export default defineConfig({
	dbCredentials: {
		url: process.env.HEM_DATABASE_PATH ?? 'hem.db',
	},
	dialect: 'sqlite',
	out: './src/database/migrations',
	schema: ['./src/database/schema/*.sql.ts'],
	strict: true,
	verbose: true,
});
