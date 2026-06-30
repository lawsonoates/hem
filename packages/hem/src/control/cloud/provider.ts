import { BindingId, CreateBindingRequest } from '@hem/console-api/schema';
import {
	CONNECTOR_POSSIBLE_OUTPUTS,
	CONNECTOR_LABELS,
} from '@hem/core/connector';
import type { ManagedConnector } from '@hem/core/connector';
import { HemError } from '@hem/core/error';
import { Console, Effect, Option } from 'effect';

import { HemApiClient, withAccessToken } from '../../api/client';
import { pollUntilComplete } from '../../api/poll';
import { getSession } from '../../auth/session';
import { openBrowser } from '../../auth/util';
import { Manifest } from '../../manifest';

const ensureNoConflictingOutputs = Effect.fn(function* (
	connector: ManagedConnector,
	outputs: readonly string[]
) {
	const manifest = yield* Manifest.Service;
	const current = yield* manifest.read();
	const manualLabels = new Set(
		current.secrets.flatMap((entry) =>
			entry.vars.map((variable) => String(variable.label))
		)
	);
	const bindingLabels = new Set(
		(current.bindings ?? [])
			.filter((binding) => binding.connector !== connector)
			.flatMap((binding) => binding.outputs)
	);
	const conflicts = outputs.filter(
		(output) => manualLabels.has(output) || bindingLabels.has(output)
	);
	if (conflicts.length > 0) {
		return yield* new HemError({
			message: `Env var "${conflicts[0]}" is already managed. Run \`hem env rm ${conflicts[0]}\` first.`,
		});
	}
});

export const connectProvider = (connector: ManagedConnector) =>
	Effect.gen(function* () {
		const label = CONNECTOR_LABELS[connector];
		yield* ensureNoConflictingOutputs(
			connector,
			CONNECTOR_POSSIBLE_OUTPUTS[connector]
		);

		const manifest = yield* Manifest.Service;
		const session = yield* getSession;
		const client = yield* HemApiClient;
		const authorization = yield* withAccessToken(
			session.accessToken,
			client.installations.startConnectorInstallation({
				params: { connector },
			})
		);

		yield* Console.log(`Opening ${label} to connect Hem...`);
		yield* openBrowser(authorization.authorizationUrl);

		const installation = yield* pollUntilComplete({
			attempt: withAccessToken(
				session.accessToken,
				client.installations.getConnectorInstallationStatus({
					params: { connector },
					query: { request_id: authorization.requestId },
				})
			).pipe(
				Effect.map(Option.some),
				Effect.catchTag('AuthorizationPending', () =>
					Effect.succeed(Option.none())
				)
			),
			expiresAt: authorization.expiresAt,
			timeoutMessage: `${label} authorization expired. Run \`hem connect ${connector}\` again.`,
		});
		const binding = yield* withAccessToken(
			session.accessToken,
			client.bindings.createBinding({
				payload: new CreateBindingRequest({
					installationId: installation.id,
				}),
			})
		);

		yield* manifest.upsertManagedBinding({
			bindingId: BindingId.make(binding.id),
			connector: binding.connector,
			outputs: binding.outputs,
		});
		yield* Console.log(
			`Connected ${label} account ${installation.account.name}`
		);
	});
