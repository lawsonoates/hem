import { expect, test } from 'bun:test';

import { GithubConnector } from '../src/github';
import { Database } from '@hem/console-core/database/database';
import { user } from '@hem/console-core/database/schema/auth';
import { Effect, Layer } from 'effect';

import { makeRuntime } from '../src/effect/app-runtime';
import { createBinding } from '../src/routes/binding';
import { createCredentialLease } from '../src/routes/credential-lease';
import {
	completeGithubInstallation,
	getGithubInstallationStatus,
	startGithubInstallation,
} from '../src/routes/installation';
import {
	CreateBindingRequest,
	CreateCredentialLeaseRequest,
	HemUserId,
} from '../src/schema';

const GithubConnectorTest = Layer.succeed(
	GithubConnector.Service,
	GithubConnector.Service.of({
		completeInstallation: (providerInstallationId) =>
			Effect.succeed({
				account: {
					id: '42',
					name: 'acme',
					type: 'organization',
				},
				grantedPermissions: { contents: 'write', issues: 'read' },
				providerInstallationId,
			}),
		createInstallationUrl: (state) =>
			`https://github.test/install?state=${state}`,
		issueCredential: ({ providerInstallationId }) =>
			Effect.succeed({
				expiresAt: '2026-06-18T01:00:00.000Z',
				token: `ghs_${providerInstallationId}`,
			}),
	})
);

const TestLayer = Layer.mergeAll(
	Database.layerFromPath(':memory:'),
	GithubConnectorTest
);

const testRuntime = makeRuntime(TestLayer);

test('creates an installation binding and credential lease', async () => {
	const result = await testRuntime.runPromise(
		Effect.gen(function* () {
			const userId = HemUserId.make('usr_1');
			const { db: database } = yield* Database.Service;
			const now = new Date();
			yield* Effect.promise(() =>
				database.insert(user).values({
					createdAt: now,
					email: 'octocat@github.test',
					emailVerified: true,
					id: userId,
					name: 'octocat',
					updatedAt: now,
				})
			);

			const authorization = yield* startGithubInstallation(userId);
			const state = new URL(
				authorization.authorizationUrl
			).searchParams.get('state');
			const pending = yield* getGithubInstallationStatus(
				userId,
				authorization.requestId
			).pipe(
				Effect.as('complete' as const),
				Effect.catchTag('AuthorizationPending', () =>
					Effect.succeed('pending' as const)
				)
			);
			expect(pending).toBe('pending');
			yield* completeGithubInstallation('1001', state ?? '');
			const installation = yield* getGithubInstallationStatus(
				userId,
				authorization.requestId
			);
			const binding = yield* createBinding(
				userId,
				new CreateBindingRequest({
					installationId: installation.id,
				})
			);
			return yield* createCredentialLease(
				userId,
				new CreateCredentialLeaseRequest({ bindingId: binding.id })
			);
		})
	);

	expect(result.values.GITHUB_TOKEN).toBe('ghs_1001');
});
