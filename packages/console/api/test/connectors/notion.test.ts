import { expect, test } from 'bun:test';

import { Effect } from 'effect';

import { layer, NotionConnector } from '../../src/connectors/notion';
import { runWithLayer } from './fixture';

test('exchanges a Notion OAuth code', async () => {
	const completed = await runWithLayer(
		layer,
		{
			NOTION_OAUTH_CLIENT_ID: 'notion-client',
			NOTION_OAUTH_CLIENT_SECRET: 'notion-secret',
			PUBLIC_API_URL: 'http://127.0.0.1:3000',
		},
		async (request) => {
			if (!request.url.includes('/v1/oauth/token'))
				return new Response('not found', { status: 404 });
			const body = (await request.json()) as { code?: string };
			expect(body.code).toBe('notion-code');
			return Response.json({
				access_token: 'secret_notion',
				workspace_id: 'ws_123',
				workspace_name: 'Acme Notion',
			});
		},
		Effect.gen(function* () {
			const notion = yield* NotionConnector.Service;
			return yield* notion.completeAuthorization({
				callback: { _tag: 'oauth', code: 'notion-code' },
			});
		})
	);

	expect(completed.providerInstallationId).toBe('notion:ws_123');
	expect(completed.account.name).toBe('Acme Notion');
	expect(completed.credentials?.accessToken).toBe('secret_notion');
});
