import { Database as HemDatabase } from '@hem/console-core/database/database';
import * as schema from '@hem/console-core/database/schema/auth';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import type { DB } from 'better-auth/adapters/drizzle';
import { bearer, deviceAuthorization } from 'better-auth/plugins';
import { drizzle } from 'drizzle-orm/bun-sql';
import { Config, Context, Effect, Layer, Redacted } from 'effect';
import { HttpEffect, HttpRouter } from 'effect/unstable/http';

export interface Interface {
	readonly handler: (request: Request) => Promise<Response>;
	readonly api: {
		readonly getSession: (input: {
			readonly headers: Headers;
		}) => Promise<{ readonly user: { readonly id: string } } | null>;
	};
}

export class Service extends Context.Service<Service, Interface>()(
	'@hem/console-api/HemAuth'
) {}

interface MakeBetterAuthOptions {
	readonly baseURL: string;
	readonly database: DB;
	readonly secret: string;
}

export const makeBetterAuth = ({
	baseURL,
	database,
	secret,
}: MakeBetterAuthOptions) =>
	betterAuth({
		basePath: '/v1/auth',
		baseURL,
		database: drizzleAdapter(database, {
			provider: 'pg',
			schema,
		}),
		emailAndPassword: { enabled: true },
		plugins: [
			bearer(),
			deviceAuthorization({
				schema: {},
				verificationUri: new URL('/device', baseURL).toString(),
			}),
		],
		secret,
	});

// Exported for the Better Auth CLI; runtime code uses makeBetterAuth.
export const auth = makeBetterAuth({
	baseURL: 'http://127.0.0.1:3000',
	database: drizzle.mock({ schema }),
	secret: 'hem-auth-schema-generation-secret',
});

export const layer = Layer.effect(
	Service,
	Effect.gen(function* () {
		const apiUrl = yield* Config.string('HEM_API_URL');
		const secret = yield* Config.redacted('BETTER_AUTH_SECRET');
		const { db } = yield* HemDatabase.Service;

		return makeBetterAuth({
			baseURL: apiUrl,
			database: db,
			secret: Redacted.value(secret),
		});
	})
);

export const defaultLayer = layer;

export const route = HttpRouter.use((router) =>
	Effect.gen(function* () {
		const auth = yield* Service;
		yield* router.add(
			'*',
			'/v1/auth/*',
			HttpEffect.fromWebHandler(auth.handler)
		);
	})
);

// oxlint-disable-next-line import/no-self-import, oxc/no-barrel-file -- namespace projection for Effect service module
export * as HemAuth from '.';
