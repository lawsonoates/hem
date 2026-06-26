#!/usr/bin/env bun

import { Database } from 'bun:sqlite';

import * as authSchema from '@hem/console-core/database/schema/auth';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { bearer, deviceAuthorization } from 'better-auth/plugins';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';

// ---- guard ----
if (process.env.NODE_ENV !== 'development') {
	console.error('Refusing to seed outside NODE_ENV=development.');
	process.exit(1);
}

// ---- config ----
const packageRoot = decodeURIComponent(
	new URL('../', import.meta.url).pathname
);
const migrationsFolder = decodeURIComponent(
	new URL('../../core/src/database/migrations', import.meta.url).pathname
);
const databasePath = process.env.HEM_DATABASE_PATH
	? (() => {
			if (process.env.HEM_DATABASE_PATH.startsWith('/'))
				return process.env.HEM_DATABASE_PATH;
			return `${process.cwd()}/${process.env.HEM_DATABASE_PATH}`;
		})()
	: `${packageRoot}hem.db`;
const apiUrl = process.env.HEM_API_URL ?? 'http://127.0.0.1:3000';
const secret =
	process.env.BETTER_AUTH_SECRET ??
	'hem-development-secret-with-at-least-32-chars';

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
const sqlite = new Database(databasePath, { create: true });
sqlite.run('PRAGMA journal_mode = WAL');
sqlite.run('PRAGMA foreign_keys = ON');

const db = drizzle(sqlite, { schema: authSchema });
migrate(db, { migrationsFolder });

const auth = betterAuth({
	basePath: '/v1/auth',
	baseURL: apiUrl,
	database: drizzleAdapter(drizzle(sqlite, { schema: authSchema }), {
		provider: 'sqlite',
	}),
	emailAndPassword: { enabled: true },
	plugins: [
		bearer(),
		deviceAuthorization({
			schema: {},
			verificationUri: new URL('/device', apiUrl).toString(),
		}),
	],
	secret,
});

// ---- seed user ----
let user = db
	.select()
	.from(authSchema.user)
	.where(eq(authSchema.user.email, seedUser.email))
	.get();

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
	user = db
		.select()
		.from(authSchema.user)
		.where(eq(authSchema.user.email, seedUser.email))
		.get();
}

if (!user) {
	console.error('Could not read seeded dev user.');
	process.exit(1);
}

// ---- clean legacy fixtures ----
for (const connector of legacyConnectorFixtures) {
	sqlite
		.query('delete from binding where id = ?')
		.run(`bind_dev_${connector}`);
	sqlite
		.query('delete from installation where id = ?')
		.run(`ins_dev_${connector}`);
}

sqlite.close();

// ---- done ----
console.log(`Seeded Hem dev database: ${databasePath}`);
console.log(`User: ${seedUser.email}`);
console.log(`Password: ${seedUser.password}`);
