import { afterAll, beforeAll, expect, test } from 'bun:test';

import { Database as HemDatabase } from '@hem/console-core/database/database';
import { ConfigProvider, Effect, Layer } from 'effect';
import { HttpRouter } from 'effect/unstable/http';

import { HemAuth, makeBetterAuth } from '../src/auth';
import { ConnectorRegistry } from '../src/connectors/registry';
import { HttpRoutesLayer, makeRuntime } from '../src/effect/app-runtime';

const publicUrl = 'http://127.0.0.1:3000';
let authRuntime: { readonly dispose: () => Promise<void> };
let testAuth: ReturnType<typeof makeBetterAuth>;

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

beforeAll(async () => {
	const runtime = makeRuntime(HemDatabase.testLayer);
	authRuntime = runtime;
	const database = await runtime.runPromise(
		HemDatabase.Service.pipe(Effect.map(({ db }) => db))
	);
	testAuth = makeBetterAuth({
		baseURL: publicUrl,
		database,
		secret: 'this-is-a-test-secret-with-at-least-32-characters',
	});
});

afterAll(async () => {
	await authRuntime.dispose();
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
	const configLayer = ConfigProvider.layer(
		ConfigProvider.fromUnknown({
			BETTER_AUTH_SECRET:
				'this-is-a-test-secret-with-at-least-32-characters',
			HEM_API_URL: publicUrl,
		})
	);
	const servicesLayer = Layer.mergeAll(
		HemAuth.defaultLayer,
		ConnectorRegistryTest
	).pipe(Layer.provideMerge(HemDatabase.testLayer));
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
	}
});
