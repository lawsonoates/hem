import { expect, test } from 'bun:test';

import { Installation as InstallationCore } from '@hem/console-core/installation';
import { Database } from '@hem/console-core/database/database';
import { user } from '@hem/console-core/database/schema/auth';
import type { ManagedConnector } from '@hem/core/connector';
import { Effect, Layer } from 'effect';

import { ConnectorRegistry } from '../src/connectors/registry';
import { ConnectorError } from '../src/connectors/types';
import type { ManagedConnectorService } from '../src/connectors/types';
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

const githubConnector = {
	completeAuthorization: ({ callback }) =>
		callback._tag === 'github'
			? Effect.succeed({
					account: {
						id: '42',
						name: 'acme',
						type: 'organization' as const,
					},
					credentials: null,
					grantedPermissions: {
						contents: 'write',
						issues: 'read',
					},
					providerInstallationId: callback.providerInstallationId,
				})
			: Effect.fail(
					new ConnectorError({
						connector: 'github',
						message: 'Expected GitHub callback.',
					})
				),
	connector: 'github' as const,
	createAuthorizationUrl: (state: string) =>
		Effect.succeed(`https://github.test/install?state=${state}`),
	issueCredential: ({ providerInstallationId }) =>
		Effect.succeed({
			expiresAt: '2026-06-18T01:00:00.000Z',
			values: {
				GITHUB_TOKEN: `ghs_${providerInstallationId}`,
			},
		}),
	outputsForInstallation: () => ['GITHUB_TOKEN'] as const,
} satisfies ManagedConnectorService;

const notionConnector = {
	completeAuthorization: ({ callback }) =>
		callback._tag === 'oauth'
			? Effect.succeed({
					account: {
						id: 'ws_123',
						name: 'Acme Notion',
						type: 'workspace' as const,
					},
					credentials: {
						accessToken: 'secret_notion',
						expiresAt: '2026-06-18T00:00:00.000Z',
						refreshToken: null,
						scope: 'read_content',
						teamId: null,
						tokenType: 'bearer',
					},
					grantedPermissions: { scope: 'read_content' },
					providerInstallationId: 'notion:ws_123',
				})
			: Effect.fail(
					new ConnectorError({
						connector: 'notion',
						message: 'Expected OAuth callback.',
					})
				),
	connector: 'notion' as const,
	createAuthorizationUrl: (state: string) =>
		Effect.succeed(`https://notion.test/oauth?state=${state}`),
	issueCredential: ({ credentials }) =>
		Effect.succeed({
			credentials: {
				accessToken: 'refreshed_notion',
				expiresAt: '2026-06-19T00:00:00.000Z',
				refreshToken: null,
				scope: 'read_content',
				teamId: null,
				tokenType: 'bearer',
			},
			expiresAt: '2026-06-19T00:00:00.000Z',
			grantedPermissions: { scope: 'read_content' },
			values: { NOTION_TOKEN: 'refreshed_notion' },
		}),
	outputsForInstallation: () => ['NOTION_TOKEN'] as const,
} satisfies ManagedConnectorService;

const connectorRegistry = {
	github: githubConnector,
	notion: notionConnector,
} as const satisfies Partial<Record<ManagedConnector, ManagedConnectorService>>;

const ConnectorRegistryTest = Layer.succeed(
	ConnectorRegistry.Service,
	ConnectorRegistry.Service.of({
		get: (connector) => {
			const service =
				connectorRegistry[
					connector as keyof typeof connectorRegistry
				];
			if (!service) {
				return Effect.die(`Unexpected connector: ${connector}`);
			}
			return Effect.succeed(service);
		},
	})
);

const TestLayer = Layer.mergeAll(
	Database.layerFromPath(':memory:'),
	ConnectorRegistryTest
);

const testRuntime = makeRuntime(TestLayer);

const seedUser = (userId: string) =>
	Effect.gen(function* () {
		const { db: database } = yield* Database.Service;
		const now = new Date();
		yield* Effect.promise(() =>
			database.insert(user).values({
				createdAt: now,
				email: `${userId}@hem.test`,
				emailVerified: true,
				id: userId,
				name: userId,
				updatedAt: now,
			})
		);
	});

test('creates an installation binding and credential lease', async () => {
	const result = await testRuntime.runPromise(
		Effect.gen(function* () {
			const userId = HemUserId.make('usr_1');
			yield* seedUser(userId);

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

test('completes a Notion OAuth installation through the flow seam', async () => {
	const installation = await testRuntime.runPromise(
		Effect.gen(function* () {
			const userId = HemUserId.make('usr_notion');
			yield* seedUser(userId);
			const authorization = yield* startConnectorInstallation(
				userId,
				'notion'
			);
			const state = authorization.requestId;
			yield* completeConnectorInstallation('notion', {
				callback: { _tag: 'oauth', code: 'notion-code' },
				state,
			});
			return yield* getConnectorInstallationStatus(userId, state);
		})
	);

	expect(installation.connector).toBe('notion');
	expect(installation.account.name).toBe('Acme Notion');
	expect(installation.providerInstallationId).toBe('notion:ws_123');
});

test('persists refreshed OAuth credentials when issuing a lease', async () => {
	const isolatedRuntime = makeRuntime(
		Layer.mergeAll(
			Database.layerFromPath(`:memory:${crypto.randomUUID()}`),
			ConnectorRegistryTest
		)
	);
	const result = await isolatedRuntime.runPromise(
		Effect.gen(function* () {
			const userId = HemUserId.make('usr_refresh');
			yield* seedUser(userId);
			const authorization = yield* startConnectorInstallation(
				userId,
				'notion'
			);
			const state = authorization.requestId;
			const completed = yield* completeConnectorInstallation('notion', {
				callback: { _tag: 'oauth', code: 'notion-code' },
				state,
			});
			const binding = yield* createBinding(
				userId,
				new CreateBindingRequest({
					installationId: completed.id,
				})
			);
			const lease = yield* createCredentialLease(
				userId,
				new CreateCredentialLeaseRequest({ bindingId: binding.id })
			);
			const stored = yield* InstallationCore.fromId(completed.id);
			return { lease, stored };
		})
	);

	expect(result.lease.values.NOTION_TOKEN).toBe('refreshed_notion');
	expect(result.stored?.credentials?.accessToken).toBe('refreshed_notion');
	await isolatedRuntime.dispose();
});