#!/usr/bin/env bun

import * as authSchema from '@hem/console-core/database/schema/auth';
import * as bindingSchema from '@hem/console-core/database/schema/binding';
import * as installationSchema from '@hem/console-core/database/schema/installation';
import { SQL } from 'bun';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/bun-sql';
import { migrate } from 'drizzle-orm/bun-sql/migrator';

import { makeBetterAuth } from '../src/auth';

// ---- guard ----
if (process.env.NODE_ENV !== 'development') {
	console.error('Refusing to seed outside NODE_ENV=development.');
	process.exit(1);
}

// ---- config ----
const migrationsFolder = decodeURIComponent(
	new URL('../../core/src/database/migrations', import.meta.url).pathname
);
const databaseUrl = process.env.HEM_DATABASE_URL;
const apiUrl = process.env.HEM_API_URL ?? 'http://127.0.0.1:3000';
const secret =
	process.env.BETTER_AUTH_SECRET ??
	'hem-development-secret-with-at-least-32-chars';

if (!databaseUrl) {
	console.error(
		'HEM_DATABASE_URL is required for the Postgres API database.'
	);
	process.exit(1);
}

const seedUser = {
	email: process.env.HEM_DEV_SEED_EMAIL ?? 'dev@hem.local',
	name: process.env.HEM_DEV_SEED_NAME ?? 'Hem Dev',
	password:
		process.env.HEM_DEV_SEED_PASSWORD ?? 'correct-horse-battery-staple',
};

const legacyConnectorFixtures = [
	'notion',
	'planetscale',
	'slack',
	'vercel',
] as const;

// ---- prepare ----
const sql = new SQL({ url: databaseUrl });
const db = drizzle(sql, {
	schema: { ...authSchema, ...bindingSchema, ...installationSchema },
});
await migrate(db, { migrationsFolder });

const auth = makeBetterAuth({
	baseURL: apiUrl,
	database: db,
	secret,
});

// ---- seed user ----
let user = (
	await db
		.select()
		.from(authSchema.user)
		.where(eq(authSchema.user.email, seedUser.email))
)[0];

if (!user) {
	const response = await auth.handler(
		new Request(new URL('/v1/auth/sign-up/email', apiUrl).toString(), {
			body: JSON.stringify(seedUser),
			headers: { 'content-type': 'application/json' },
			method: 'POST',
		})
	);
	if (!response.ok) {
		console.error(
			`Could not create dev user: HTTP ${response.status} ${await response.text()}`
		);
		process.exit(1);
	}
	user = (
		await db
			.select()
			.from(authSchema.user)
			.where(eq(authSchema.user.email, seedUser.email))
	)[0];
}

if (!user) {
	console.error('Could not read seeded dev user.');
	process.exit(1);
}

// ---- clean legacy fixtures ----
for (const connector of legacyConnectorFixtures) {
	await db
		.delete(bindingSchema.BindingTable)
		.where(eq(bindingSchema.BindingTable.id, `bind_dev_${connector}`));
	await db
		.delete(installationSchema.InstallationTable)
		.where(
			eq(installationSchema.InstallationTable.id, `ins_dev_${connector}`)
		);
}

await sql.close();

// ---- done ----
console.log('Seeded Hem dev database.');
console.log(`User: ${seedUser.email}`);
console.log(`Password: ${seedUser.password}`);
