import { expect, test } from 'bun:test';

import { Effect } from 'effect';

import { layer, SlackConnector } from '../../src/connectors/slack';
import { runWithLayer } from './fixture';

test('exchanges a Slack OAuth code', async () => {
	const completed = await runWithLayer(
		layer,
		{
			PUBLIC_API_URL: 'http://127.0.0.1:3000',
			SLACK_CLIENT_ID: 'slack-client',
			SLACK_CLIENT_SECRET: 'slack-secret',
		},
		() =>
			Response.json({
				access_token: 'xoxb_test',
				ok: true,
				scope: 'chat:write',
				team: { id: 'T123', name: 'Hem Workspace' },
				token_type: 'bot',
			}),
		Effect.gen(function* () {
			const slack = yield* SlackConnector.Service;
			return yield* slack.completeAuthorization({
				callback: { _tag: 'oauth', code: 'slack-code' },
			});
		})
	);

	expect(completed.providerInstallationId).toBe('slack:T123');
	expect(completed.account.name).toBe('Hem Workspace');
	expect(completed.credentials?.accessToken).toBe('xoxb_test');
});
