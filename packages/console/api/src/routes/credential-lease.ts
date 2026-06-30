import { Binding as BindingCore } from '@hem/console-core/binding';
import {
	persistProviderCredentials,
	redactProviderCredentials,
} from '@hem/console-core/credentials';
import { Installation as InstallationCore } from '@hem/console-core/installation';
import { Effect } from 'effect';
import { HttpApiBuilder } from 'effect/unstable/httpapi';

import { HemApi } from '../api';
import { ConnectorRegistry } from '../connectors/registry';
import { ConnectorError } from '../connectors/types';
import { BadRequest, Forbidden, NotFound } from '../errors';
import { CurrentUser } from '../middleware/auth';
import { CredentialLease } from '../schema';
import type { CreateCredentialLeaseRequest } from '../schema';

export const createCredentialLease = (
	ownerId: string,
	request: CreateCredentialLeaseRequest
) =>
	Effect.gen(function* () {
		const binding = yield* BindingCore.fromId(request.bindingId);
		if (!binding) {
			return yield* new NotFound({
				message: 'Binding was not found.',
			});
		}
		const installation = yield* InstallationCore.fromId(
			binding.installationId
		);
		if (!installation) {
			return yield* new NotFound({
				message: 'Installation was not found.',
			});
		}
		if (installation.ownerId !== ownerId) {
			return yield* new Forbidden({
				message: 'Binding belongs to another user.',
			});
		}
		const registry = yield* ConnectorRegistry.Service;
		const connector = yield* registry.get(installation.connector);
		const storedCredentials = installation.credentials
			? redactProviderCredentials(installation.credentials)
			: null;
		const credential = yield* connector
			.issueCredential({
				credentials: storedCredentials
					? persistProviderCredentials(storedCredentials)
					: null,
				grantedPermissions: installation.grantedPermissions,
				providerInstallationId: installation.providerInstallationId,
			})
			.pipe(
				Effect.catchTags({
					ConfigError: (error) =>
						Effect.fail(
							new ConnectorError({
								cause: error,
								connector: installation.connector,
								message: `${installation.connector} connector is not configured correctly.`,
							})
						),
					GithubConnectorError: (error) =>
						Effect.fail(
							new ConnectorError({
								cause: error.cause,
								connector: installation.connector,
								message: error.message,
							})
						),
				})
			);
		if (credential.credentials) {
			yield* InstallationCore.updateCredentials({
				credentials: persistProviderCredentials(
					redactProviderCredentials(credential.credentials)
				),
				grantedPermissions:
					credential.grantedPermissions ??
					installation.grantedPermissions,
				id: installation.id,
			});
		}
		return new CredentialLease({
			expiresAt: credential.expiresAt,
			values: credential.values,
		});
	});

export const CredentialLeaseLive = HttpApiBuilder.group(
	HemApi,
	'credentialLeases',
	(handlers) =>
		handlers.handle('createCredentialLease', ({ payload }) =>
			Effect.gen(function* () {
				const user = yield* CurrentUser;
				return yield* createCredentialLease(user.id, payload);
			}).pipe(
				Effect.catchTags({
					SchemaError: (error) =>
						Effect.fail(new BadRequest({ message: error.message })),
				})
			)
		)
);
