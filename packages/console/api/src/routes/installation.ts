import { Effect } from 'effect';
import { HttpApiBuilder } from 'effect/unstable/httpapi';

import { HemApi } from '../api';
import { ConnectorError } from '../connectors/types';
import { BadRequest } from '../errors';
import {
	callbackFromQuery,
	completeConnectorInstallation,
	getConnectorInstallationStatus,
	startConnectorInstallation,
} from '../installation/flow';
import { CurrentUser } from '../middleware/auth';

export const InstallationLive = HttpApiBuilder.group(
	HemApi,
	'installations',
	(handlers) =>
		handlers
			.handle('startConnectorInstallation', ({ params }) =>
				Effect.gen(function* () {
					const user = yield* CurrentUser;
					return yield* startConnectorInstallation(
						user.id,
						params.connector
					);
				}).pipe(
					Effect.catchTags({
						ConfigError: (error) =>
							Effect.fail(
								new ConnectorError({
									cause: error,
									connector: params.connector,
									message: `${params.connector} connector is not configured correctly.`,
								})
							),
						GithubConnectorError: (error) =>
							Effect.fail(
								new ConnectorError({
									cause: error.cause,
									connector: params.connector,
									message: error.message,
								})
							),
						SchemaError: (error) =>
							Effect.fail(
								new BadRequest({ message: error.message })
							),
					})
				)
			)
			.handle('completeConnectorInstallation', ({ params, query }) =>
				Effect.gen(function* () {
					const callback = yield* callbackFromQuery(
						params.connector,
						query
					);
					return yield* completeConnectorInstallation(
						params.connector,
						{ callback, state: query.state }
					);
				}).pipe(
					Effect.catchTags({
						ConfigError: (error) =>
							Effect.fail(
								new ConnectorError({
									cause: error,
									connector: params.connector,
									message: `${params.connector} connector is not configured correctly.`,
								})
							),
						GithubConnectorError: (error) =>
							Effect.fail(
								new ConnectorError({
									cause: error.cause,
									connector: params.connector,
									message: error.message,
								})
							),
						SchemaError: (error) =>
							Effect.fail(
								new BadRequest({ message: error.message })
							),
					})
				)
			)
			.handle('getConnectorInstallationStatus', ({ query }) =>
				Effect.gen(function* () {
					const user = yield* CurrentUser;
					return yield* getConnectorInstallationStatus(
						user.id,
						query.request_id
					);
				}).pipe(
					Effect.catchTags({
						SchemaError: (error) =>
							Effect.fail(
								new BadRequest({ message: error.message })
							),
					})
				)
			)
);
