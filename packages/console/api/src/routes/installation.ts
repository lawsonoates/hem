import { Effect } from 'effect';
import { HttpApiBuilder } from 'effect/unstable/httpapi';

import { HemApi } from '../api';
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
				})
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
				})
			)
			.handle('getConnectorInstallationStatus', ({ params, query }) =>
				Effect.gen(function* () {
					const user = yield* CurrentUser;
					return yield* getConnectorInstallationStatus(
						user.id,
						query.request_id
					);
				})
			)
);