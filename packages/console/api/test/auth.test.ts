import { Database } from 'bun:sqlite';
import { afterAll, expect, test } from 'bun:test';

import { Database as HemDatabase } from '@hem/console-core/database/database';
import * as authSchema from '@hem/console-core/database/schema/auth';
import * as bindingSchema from '@hem/console-core/database/schema/binding';
import * as installationSchema from '@hem/console-core/database/schema/installation';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { bearer, deviceAuthorization } from 'better-auth/plugins';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { ConfigProvider, Effect, Layer } from 'effect';
import { HttpRouter } from 'effect/unstable/http';

import { HemAuth } from '../src/auth';
import { ConnectorRegistry } from '../src/connectors/registry';
import { HttpRoutesLayer } from '../src/effect/app-runtime';

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

const ConnectorRegistryTest = Layer.succeed(
	ConnectorRegistry.Service,
	ConnectorRegistry.Service.of({
		get: () => Effect.die('unused in auth tests'),
	})
);

const cookieHeader = (response: Response) =>
	response.headers
		.getSetCookie()
		.map((cookie) => cookie.split(';', 1)[0])
		.join('; ');

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

test('preserves browser session cookies when approving a device request', async () => {
	const apiDatabasePath = `${import.meta.dir}/auth-api.${crypto.randomUUID()}.db`;
	const configLayer = ConfigProvider.layer(
		ConfigProvider.fromUnknown({
			BETTER_AUTH_SECRET:
				'this-is-a-test-secret-with-at-least-32-characters',
			HEM_API_URL: publicUrl,
			HEM_DATABASE_PATH: apiDatabasePath,
		})
	);
	const servicesLayer = Layer.mergeAll(
		HemDatabase.layerFromPath(apiDatabasePath),
		HemAuth.defaultLayer,
		ConnectorRegistryTest
	);
	const appLayer = HttpRoutesLayer.pipe(
		Layer.provide(servicesLayer),
		Layer.provide(configLayer)
	) as Layer.Layer<never, never, HttpRouter.HttpRouter>;
	const { dispose, handler: appHandler } = HttpRouter.toWebHandler(appLayer, {
		disableLogger: true,
	});
	const handler: (request: Request) => Promise<Response> = appHandler;

	try {
		const authorization = await handler(
			new Request('http://127.0.0.1:3000/v1/auth/device/code', {
				body: JSON.stringify({ client_id: 'hem-cli' }),
				headers: { 'content-type': 'application/json' },
				method: 'POST',
			})
		);
		expect(authorization.status).toBe(200);
		const authorizationBody = (await authorization.json()) as {
			device_code: string;
			user_code: string;
		};

		const signUp = await handler(
			new Request('http://127.0.0.1:3000/v1/auth/sign-up/email', {
				body: JSON.stringify({
					email: 'browser@hem.dev',
					name: 'Browser User',
					password: 'correct-horse-battery-staple',
				}),
				headers: { 'content-type': 'application/json' },
				method: 'POST',
			})
		);
		expect(signUp.status).toBe(200);
		expect(cookieHeader(signUp)).toContain('better-auth.session_token=');

		const claim = await handler(
			new Request(
				`http://127.0.0.1:3000/v1/auth/device?user_code=${authorizationBody.user_code}`,
				{
					headers: {
						cookie: cookieHeader(signUp),
					},
				}
			)
		);
		expect(claim.status).toBe(200);

		const approval = await handler(
			new Request('http://127.0.0.1:3000/v1/auth/device/approve', {
				body: JSON.stringify({
					userCode: authorizationBody.user_code,
				}),
				headers: {
					'content-type': 'application/json',
					cookie: cookieHeader(signUp),
					origin: publicUrl,
				},
				method: 'POST',
			})
		);
		expect(approval.status).toBe(200);
		expect(await approval.json()).toMatchObject({ success: true });

		const token = await handler(
			new Request('http://127.0.0.1:3000/v1/auth/device/token', {
				body: JSON.stringify({
					client_id: 'hem-cli',
					device_code: authorizationBody.device_code,
					grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
				}),
				headers: { 'content-type': 'application/json' },
				method: 'POST',
			})
		);
		expect(token.status).toBe(200);
		expect(await token.json()).toMatchObject({
			token_type: 'Bearer',
		});
	} finally {
		await dispose();
		await Promise.all(
			[
				apiDatabasePath,
				`${apiDatabasePath}-shm`,
				`${apiDatabasePath}-wal`,
			].map((path) =>
				Bun.file(path)
					.delete()
					.catch(() => false)
			)
		);
	}
});
