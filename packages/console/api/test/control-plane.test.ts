import { expect, test } from 'bun:test';

import { Database } from '@hem/console-core/database/database';
import { user } from '@hem/console-core/database/schema/auth';
import { Effect, Layer } from 'effect';

import { ConnectorRegistry } from '../src/connectors/registry';
import { ConnectorError } from '../src/connectors/types';
import { makeRuntime } from '../src/effect/app-runtime';
import {
	completeConnectorInstallation,
	getConnectorInstallationStatus,
	startConnectorInstallation,
} from '../src/installation/flow';
import { createBinding } from '../src/routes/binding';
import { createCredentialLease } from '../src/routes/credential-lease';
import {
	CreateBindingRequest,
	CreateCredentialLeaseRequest,
	HemUserId,
} from '../src/schema';

const ConnectorRegistryTest = Layer.succeed(
	ConnectorRegistry.Service,
	ConnectorRegistry.Service.of({
		get: (connector) =>
			connector === 'github'
				? Effect.succeed({
						completeAuthorization: ({ callback }) =>
							callback._tag === 'github'
								? Effect.succeed({
										account: {
											id: '42',
											name: 'acme',
											type: 'organization',
										},
										credentials: null,
										grantedPermissions: {
											contents: 'write',
											issues: 'read',
										},
										providerInstallationId:
											callback.providerInstallationId,
									})
								: Effect.fail(
										new ConnectorError({
											connector: 'github',
											message:
												'Expected GitHub callback.',
										})
									),
						connector: 'github' as const,
						createAuthorizationUrl: (state) =>
							Effect.succeed(
								`https://github.test/install?state=${state}`
							),
						issueCredential: ({ providerInstallationId }) =>
							Effect.succeed({
								expiresAt: '2026-06-18T01:00:00.000Z',
								values: {
									GITHUB_TOKEN: `ghs_${providerInstallationId}`,
								},
							}),
						outputsForInstallation: () => ['GITHUB_TOKEN'] as const,
					})
				: Effect.die(`Unexpected connector: ${connector}`),
	})
);

const TestLayer = Layer.mergeAll(
	Database.layerFromPath(':memory:'),
	ConnectorRegistryTest
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

			const authorization = yield* startConnectorInstallation(
				userId,
				'github'
			);
			const state = new URL(
				authorization.authorizationUrl
			).searchParams.get('state');
			const pending = yield* getConnectorInstallationStatus(
				userId,
				authorization.requestId
			).pipe(
				Effect.as('complete' as const),
				Effect.catchTag('AuthorizationPending', () =>
					Effect.succeed('pending' as const)
				)
			);
			expect(pending).toBe('pending');
			yield* completeConnectorInstallation('github', {
				callback: {
					_tag: 'github',
					providerInstallationId: '1001',
				},
				state: state ?? '',
			});
			const installation = yield* getConnectorInstallationStatus(
				userId,
				authorization.requestId
			);
			const binding = yield* createBinding(
				userId,
				new CreateBindingRequest({
					installationId: installation.id,
				})
			);
			expect(binding.outputs).toEqual(['GITHUB_TOKEN']);
			return yield* createCredentialLease(
				userId,
				new CreateCredentialLeaseRequest({ bindingId: binding.id })
			);
		})
	);

	expect(result.values.GITHUB_TOKEN).toBe('ghs_1001');
});