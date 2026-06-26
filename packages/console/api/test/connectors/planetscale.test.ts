import { expect, test } from 'bun:test';

import { Effect } from 'effect';

import {
	defaultLayer,
	PlanetScaleConnector,
} from '../../src/connectors/planetscale';
import { runWithLayer } from './fixture';

test('exchanges a PlanetScale OAuth code', async () => {
	const completed = await runWithLayer(
		defaultLayer,
		{
			PLANETSCALE_OAUTH_CLIENT_ID: 'ps-client',
			PLANETSCALE_OAUTH_CLIENT_SECRET: 'ps-secret',
			PUBLIC_API_URL: 'http://127.0.0.1:3000',
		},
		async (request) => {
			if (request.url.includes('/oauth/token/info')) {
				return Response.json({
					active: true,
					exp: 1_900_000_000,
					scope: 'read_databases',
					sub: 'user_42',
				});
			}
			return Response.json({
				access_token: 'ps_token',
				expires_in: 3600,
				refresh_token: 'ps_refresh',
				scope: 'read_databases',
				token_type: 'Bearer',
			});
		},
		Effect.gen(function* () {
			const planetscale = yield* PlanetScaleConnector.Service;
			return yield* planetscale.completeAuthorization({
				callback: { _tag: 'oauth', code: 'ps-code' },
			});
		})
	);

	expect(completed.providerInstallationId).toBe('planetscale:user_42');
	expect(completed.credentials?.accessToken).toBe('ps_token');
	expect(completed.grantedPermissions).toEqual({ scope: 'read_databases' });
});