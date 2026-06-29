import {
	Installation as InstallationCore,
	InstallationRequest,
} from '@hem/console-core/installation';
import type { ParsedInstallationRow } from '@hem/console-core/installation';
import { isOAuthConnector } from '@hem/core/connector';
import type { ManagedConnector } from '@hem/core/connector';
import { Clock, Effect } from 'effect';

import { ConnectorRegistry } from '../connectors/registry';
import type { ConnectorAuthorizationCallback } from '../connectors/types';
import {
	AuthorizationPending,
	InvalidAuthorization,
	InvalidInstallationState,
	NotFound,
} from '../errors';
import { randomUuid } from '../prelude/id';
import {
	ConnectorInstallationAuthorization,
	Installation,
	InstallationId,
} from '../schema';

const INSTALLATION_TTL_MS = 10 * 60 * 1000;

const toInstallation = (row: ParsedInstallationRow) =>
	new Installation({
		account: row.account,
		connector: row.connector,
		id: InstallationId.make(row.id),
		providerInstallationId: row.providerInstallationId,
	});

/**
 * Starts a managed connector installation for a Hem user.
 */
export const startConnectorInstallation = (
	ownerId: string,
	connectorName: ManagedConnector
) =>
	Effect.gen(function* () {
		const registry = yield* ConnectorRegistry.Service;
		const connector = yield* registry.get(connectorName);
		const state = yield* randomUuid;
		const now = yield* Clock.currentTimeMillis;
		const expiresAt = new Date(now + INSTALLATION_TTL_MS);
		yield* InstallationRequest.create({
			expiresAt,
			ownerId,
			state,
		});
		const authorizationUrl = yield* connector.createAuthorizationUrl(state);
		return new ConnectorInstallationAuthorization({
			authorizationUrl,
			expiresAt: expiresAt.toISOString(),
			requestId: state,
		});
	});

/**
 * Parses an OAuth or GitHub callback query into a connector callback value.
 */
export const callbackFromQuery = (
	connectorName: ManagedConnector,
	query: {
		readonly code?: string;
		readonly installation_id?: string;
	}
): Effect.Effect<ConnectorAuthorizationCallback, InvalidInstallationState> => {
	if (isOAuthConnector(connectorName)) {
		if (!query.code) {
			return Effect.fail(
				new InvalidInstallationState({
					message: `${connectorName} callback is missing OAuth code.`,
				})
			);
		}
		return Effect.succeed({ _tag: 'oauth', code: query.code });
	}
	if (!query.installation_id) {
		return Effect.fail(
			new InvalidInstallationState({
				message: 'GitHub callback is missing installation_id.',
			})
		);
	}
	return Effect.succeed({
		_tag: 'github',
		providerInstallationId: query.installation_id,
	});
};

/**
 * Completes a managed connector installation from an authorization callback.
 */
export const completeConnectorInstallation = (
	connectorName: ManagedConnector,
	input: {
		readonly callback: ConnectorAuthorizationCallback;
		readonly state: string;
	}
) =>
	Effect.gen(function* () {
		const ownerId = yield* InstallationRequest.owner(input.state);
		if (!ownerId) {
			return yield* new InvalidInstallationState({
				message: 'Installation state is invalid or expired.',
			});
		}
		const registry = yield* ConnectorRegistry.Service;
		const connector = yield* registry.get(connectorName);
		const completed = yield* connector.completeAuthorization({
			callback: input.callback,
		});
		const existing = yield* InstallationCore.fromProviderId(
			completed.providerInstallationId
		);
		if (existing && existing.ownerId !== ownerId) {
			return yield* new InvalidInstallationState({
				message: `${connector.connector} installation belongs to another Hem user.`,
			});
		}
		const installation = yield* InstallationCore.save({
			account: completed.account,
			connector: connector.connector,
			credentials: completed.credentials,
			grantedPermissions: completed.grantedPermissions,
			id: existing?.id,
			ownerId,
			providerInstallationId: completed.providerInstallationId,
		});
		if (!installation) {
			return yield* Effect.die(
				new Error(
					`${connector.connector} installation insert returned no row.`
				)
			);
		}
		yield* InstallationRequest.complete({
			installationId: installation.id,
			state: input.state,
		});
		return toInstallation(installation);
	});

/**
 * Polls a managed connector installation request for completion.
 */
export const getConnectorInstallationStatus = (
	ownerId: string,
	requestId: string
) =>
	Effect.gen(function* () {
		const status = yield* InstallationRequest.poll({
			ownerId,
			state: requestId,
		});
		if (status._tag === 'Invalid') {
			return yield* new InvalidAuthorization({
				message: 'Installation request is invalid or expired.',
			});
		}
		if (status._tag === 'Pending') {
			return yield* new AuthorizationPending({
				message: 'Provider installation is not complete yet.',
			});
		}
		const installation = yield* InstallationCore.fromId(
			status.installationId
		);
		if (!installation) {
			return yield* new NotFound({
				message: 'Installation was not found.',
			});
		}
		return toInstallation(installation);
	});
