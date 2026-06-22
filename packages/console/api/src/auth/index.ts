import { Database } from 'bun:sqlite';

import * as schema from '@hem/console-core/database/schema/auth';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { bearer, deviceAuthorization } from 'better-auth/plugins';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { Config, Context, Effect, Layer, Redacted } from 'effect';

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

export const layer = Layer.effect(
	Service,
	Effect.gen(function* () {
		const databasePath = yield* Config.string('HEM_DATABASE_PATH').pipe(
			Config.withDefault('hem.db')
		);
		const apiUrl = yield* Config.string('HEM_API_URL');
		const secret = yield* Config.redacted('BETTER_AUTH_SECRET');

		return betterAuth({
			basePath: '/v1/auth',
			baseURL: apiUrl,
			database: drizzleAdapter(
				drizzle(new Database(databasePath), { schema }),
				{ provider: 'sqlite' }
			),
			emailAndPassword: { enabled: true },
			plugins: [
				bearer(),
				deviceAuthorization({
					schema: {},
					verificationUri: new URL('/device', apiUrl).toString(),
				}),
			],
			secret: Redacted.value(secret),
		});
	})
);

export const defaultLayer = layer;

// oxlint-disable-next-line import/no-self-import, oxc/no-barrel-file -- namespace projection for Effect service module
export * as HemAuth from '.';
