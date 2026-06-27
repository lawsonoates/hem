import { expect, test } from 'bun:test';

import { Effect } from 'effect';

import { layer, VercelConnector } from '../../src/connectors/vercel';
import { runWithLayer } from './fixture';

test('exchanges a Vercel OAuth code', async () => {
	const completed = await runWithLayer(
		layer,
		{
			PUBLIC_API_URL: 'http://127.0.0.1:3000',
			VERCEL_CLIENT_ID: 'vercel-client',
			VERCEL_CLIENT_SECRET: 'vercel-secret',
			VERCEL_INTEGRATION_SLUG: 'hem-test',
		},
		async () =>
			Response.json({
				access_token: 'vercel_token',
				scope: 'read',
				team_id: 'team_9',
				token_type: 'Bearer',
			}),
		Effect.gen(function* () {
			const vercel = yield* VercelConnector.Service;
			return yield* vercel.completeAuthorization({
				callback: { _tag: 'oauth', code: 'vercel-code' },
			});
		})
	);

	expect(completed.providerInstallationId).toBe('vercel:team_9');
	expect(completed.account.type).toBe('organization');
	expect(completed.credentials?.teamId).toBe('team_9');
});
