import { defineConfig } from 'drizzle-kit';

export default defineConfig({
	dbCredentials: {
		url: process.env.HEM_DATABASE_URL ?? '',
	},
	dialect: 'postgresql',
	out: './src/database/migrations',
	schema: ['./src/database/schema/*.sql.ts'],
	strict: true,
	verbose: true,
});
