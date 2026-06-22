import { GithubConnector } from '../github';
import { Binding as BindingCore } from '@hem/console-core/binding';
import { Installation as InstallationCore } from '@hem/console-core/installation';
import { Effect } from 'effect';
import { HttpApiBuilder } from 'effect/unstable/httpapi';

import { HemApi } from '../api';
import { Forbidden, NotFound, ProviderUnavailable } from '../errors';
import { CurrentUser } from '../middleware/auth';
import { CredentialLease } from '../schema';
import type { CreateCredentialLeaseRequest } from '../schema';

export const createCredentialLease = (
	ownerId: string,
	request: CreateCredentialLeaseRequest
) =>
	Effect.gen(function* () {
		const binding = yield* BindingCore.fromId(request.bindingId).pipe(
			Effect.orDie
		);
		if (!binding)
			return yield* new NotFound({ message: 'Binding was not found.' });

		const installation = yield* InstallationCore.fromId(
			binding.installationId
		).pipe(Effect.orDie);
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
		const github = yield* GithubConnector.Service;
		const credential = yield* github
			.issueCredential({
				providerInstallationId: installation.providerInstallationId,
			})
			.pipe(
				Effect.mapError(
					() =>
						new ProviderUnavailable({
							message:
								'GitHub could not issue an installation token.',
						})
				)
			);
		return new CredentialLease({
			expiresAt: credential.expiresAt,
			values: { GITHUB_TOKEN: credential.token },
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
			})
		)
);
