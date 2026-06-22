import { expect, test } from 'bun:test';
import { generateKeyPairSync } from 'node:crypto';

import { ConfigProvider, Effect, Layer } from 'effect';

import { defaultLayer, GithubConnector } from '../../src/github';

test('issues a credential without narrowing the installation grant', async () => {
	const requests: { body: string; method: string; pathname: string }[] = [];
	const server = Bun.serve({
		fetch: async (request) => {
			requests.push({
				body: await request.text(),
				method: request.method,
				pathname: new URL(request.url).pathname,
			});
			return Response.json({
				expires_at: '2026-06-22T01:00:00.000Z',
				token: 'ghs_test',
			});
		},
		port: 0,
	});

	try {
		const { privateKey } = generateKeyPairSync('rsa', {
			modulusLength: 2048,
		});
		const configLayer = ConfigProvider.layer(
			ConfigProvider.fromUnknown({
				GITHUB_API_URL: `http://127.0.0.1:${server.port}`,
				GITHUB_APP_ID: '1234',
				GITHUB_APP_PRIVATE_KEY: privateKey
					.export({ format: 'pem', type: 'pkcs1' })
					.toString(),
				GITHUB_APP_SLUG: 'hem-test',
			})
		);
		const connectorLayer = defaultLayer.pipe(Layer.provide(configLayer));
		const credential = await Effect.runPromise(
			Effect.gen(function* () {
				const github = yield* GithubConnector.Service;
				return yield* github.issueCredential({
					providerInstallationId: '1001',
				});
			}).pipe(Effect.provide(connectorLayer))
		);

		expect(credential.token).toBe('ghs_test');
		expect(requests).toEqual([
			{
				body: '',
				method: 'POST',
				pathname: '/app/installations/1001/access_tokens',
			},
		]);
	} finally {
		await server.stop(true);
	}
});
