import { GithubConnector } from '../github';
import {
	Installation as InstallationCore,
	InstallationRequest,
} from '@hem/console-core/installation';
import type { InstallationRow } from '@hem/console-core/installation';
import { Effect } from 'effect';
import { HttpApiBuilder } from 'effect/unstable/httpapi';

import { HemApi } from '../api';
import { CurrentUser } from '../middleware/auth';
import {
	AuthorizationPending,
	InvalidAuthorization,
	InvalidInstallationState,
	NotFound,
	ProviderUnavailable,
} from '../errors';
import {
	GithubAccount,
	GithubInstallationAuthorization,
	Installation,
	InstallationId,
} from '../schema';

const INSTALLATION_TTL_MS = 10 * 60 * 1000;

const toInstallation = (row: InstallationRow) =>
	new Installation({
		account: new GithubAccount(row.account),
		connector: 'github',
		id: InstallationId.make(row.id),
		providerInstallationId: row.providerInstallationId,
	});

export const startGithubInstallation = (ownerId: string) =>
	Effect.gen(function* () {
		const github = yield* GithubConnector.Service;
		const state = crypto.randomUUID();
		const expiresAt = new Date(Date.now() + INSTALLATION_TTL_MS);
		yield* InstallationRequest.create({ expiresAt, ownerId, state }).pipe(
			Effect.orDie
		);
		return new GithubInstallationAuthorization({
			authorizationUrl: github.createInstallationUrl(state),
			expiresAt: expiresAt.toISOString(),
			requestId: state,
		});
	});

export const completeGithubInstallation = (
	providerInstallationId: string,
	state: string
) =>
	Effect.gen(function* () {
		const ownerId = yield* InstallationRequest.owner(state).pipe(
			Effect.orDie
		);
		if (!ownerId) {
			return yield* new InvalidInstallationState({
				message: 'Installation state is invalid or expired.',
			});
		}
		const github = yield* GithubConnector.Service;
		const completed = yield* github
			.completeInstallation(providerInstallationId)
			.pipe(
				Effect.mapError(
					() =>
						new ProviderUnavailable({
							message:
								'GitHub could not complete the installation.',
						})
				)
			);
		const existing = yield* InstallationCore.fromProviderId(
			completed.providerInstallationId
		).pipe(Effect.orDie);
		if (existing && existing.ownerId !== ownerId) {
			return yield* new InvalidInstallationState({
				message: 'GitHub installation belongs to another Hem user.',
			});
		}
		const installation = yield* InstallationCore.save({
			account: completed.account,
			grantedPermissions: completed.grantedPermissions,
			id: existing?.id,
			ownerId,
			providerInstallationId: completed.providerInstallationId,
		}).pipe(Effect.orDie);
		if (!installation) {
			return yield* Effect.die(
				new Error('GitHub installation insert returned no row.')
			);
		}
		yield* InstallationRequest.complete({
			installationId: installation.id,
			state,
		}).pipe(Effect.orDie);
		return toInstallation(installation);
	});

export const getGithubInstallationStatus = (
	ownerId: string,
	requestId: string
) =>
	Effect.gen(function* () {
		const status = yield* InstallationRequest.poll({
			ownerId,
			state: requestId,
		}).pipe(Effect.orDie);
		if (status._tag === 'Invalid') {
			return yield* new InvalidAuthorization({
				message: 'Installation request is invalid or expired.',
			});
		}
		if (status._tag === 'Pending') {
			return yield* new AuthorizationPending({
				message: 'GitHub installation is not complete yet.',
			});
		}
		const installation = yield* InstallationCore.fromId(
			status.installationId
		).pipe(Effect.orDie);
		if (!installation) {
			return yield* new NotFound({
				message: 'Installation was not found.',
			});
		}
		return toInstallation(installation);
	});

export const InstallationLive = HttpApiBuilder.group(
	HemApi,
	'installations',
	(handlers) =>
		handlers
			.handle('startGithubInstallation', () =>
				Effect.gen(function* () {
					const user = yield* CurrentUser;
					return yield* startGithubInstallation(user.id);
				})
			)
			.handle('completeGithubInstallation', ({ query }) =>
				completeGithubInstallation(query.installation_id, query.state)
			)
			.handle('getGithubInstallationStatus', ({ query }) =>
				Effect.gen(function* () {
					const user = yield* CurrentUser;
					return yield* getGithubInstallationStatus(
						user.id,
						query.request_id
					);
				})
			)
);