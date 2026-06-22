import { Database } from 'bun:sqlite';
import { afterAll, expect, test } from 'bun:test';

import * as authSchema from '@hem/console-core/database/schema/auth';
import * as bindingSchema from '@hem/console-core/database/schema/binding';
import * as installationSchema from '@hem/console-core/database/schema/installation';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';

import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { bearer, deviceAuthorization } from 'better-auth/plugins';

const databasePath = `${import.meta.dir}/auth.test.db`;
const publicUrl = 'http://127.0.0.1:3000';
const sqlite = new Database(databasePath, { create: true });
const database = drizzle(sqlite, {
	schema: { ...authSchema, ...bindingSchema, ...installationSchema },
});
const migrationsFolder = decodeURIComponent(
	new URL('../../core/src/database/migrations', import.meta.url).pathname
);
migrate(database, { migrationsFolder });
sqlite.close();

const testAuth = betterAuth({
	basePath: '/v1/auth',
	baseURL: publicUrl,
	database: drizzleAdapter(
		drizzle(new Database(databasePath), { schema: authSchema }),
		{ provider: 'sqlite' }
	),
	emailAndPassword: { enabled: true },
	plugins: [
		bearer(),
		deviceAuthorization({
			schema: {},
			verificationUri: new URL('/device', publicUrl).toString(),
		}),
	],
	secret: 'this-is-a-test-secret-with-at-least-32-characters',
});

test('creates a Hem account with email and password', async () => {
	const response = await testAuth.handler(
		new Request('http://127.0.0.1:3000/v1/auth/sign-up/email', {
			body: JSON.stringify({
				email: 'person@hem.dev',
				name: 'Hem User',
				password: 'correct-horse-battery-staple',
			}),
			headers: { 'content-type': 'application/json' },
			method: 'POST',
		})
	);
	expect(response.status).toBe(200);
	expect(await response.json()).toMatchObject({
		user: { email: 'person@hem.dev', name: 'Hem User' },
	});

	const signIn = await testAuth.handler(
		new Request('http://127.0.0.1:3000/v1/auth/sign-in/email', {
			body: JSON.stringify({
				email: 'person@hem.dev',
				password: 'correct-horse-battery-staple',
			}),
			headers: { 'content-type': 'application/json' },
			method: 'POST',
		})
	);
	expect(signIn.status).toBe(200);
});

test('does not configure GitHub as an authentication provider', async () => {
	const response = await testAuth.handler(
		new Request('http://127.0.0.1:3000/v1/auth/sign-in/social', {
			body: JSON.stringify({ provider: 'github' }),
			headers: { 'content-type': 'application/json' },
			method: 'POST',
		})
	);
	expect(response.status).toBe(404);
});

afterAll(() => {
	Bun.file(databasePath).delete();
});

test('issues and polls a Better Auth device authorization', async () => {
	const authorization = await testAuth.handler(
		new Request('http://127.0.0.1:3000/v1/auth/device/code', {
			body: JSON.stringify({ client_id: 'hem-cli' }),
			headers: { 'content-type': 'application/json' },
			method: 'POST',
		})
	);
	expect(authorization.status).toBe(200);
	const body = (await authorization.json()) as {
		device_code: string;
		verification_uri_complete: string;
	};
	expect(body.verification_uri_complete).toContain('/device?user_code=');

	const token = await testAuth.handler(
		new Request('http://127.0.0.1:3000/v1/auth/device/token', {
			body: JSON.stringify({
				client_id: 'hem-cli',
				device_code: body.device_code,
				grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
			}),
			headers: { 'content-type': 'application/json' },
			method: 'POST',
		})
	);
	expect(token.status).toBe(400);
	expect(await token.json()).toMatchObject({
		error: 'authorization_pending',
	});
});
