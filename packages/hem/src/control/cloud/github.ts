import { CreateBindingRequest } from '@hem/console-api/schema';
import { HemError } from '@hem/core/error';
import { Console, Effect, Option } from 'effect';

import { HemApiClient, withAccessToken } from '../../api/client';
import { pollUntilComplete } from '../../api/poll';
import { getSession } from '../../auth/session';
import { openBrowser } from '../../auth/util';
import { Manifest } from '../../manifest';

export const connectGithub = Effect.gen(function* () {
	const manifest = yield* Manifest.Service;
	const current = yield* manifest.read();
	const hasManualGithubToken = current.secrets.some((entry) =>
		entry.vars.some((variable) => variable.label === 'GITHUB_TOKEN')
	);
	if (hasManualGithubToken) {
		return yield* new HemError({
			message:
				'Env var "GITHUB_TOKEN" is already managed manually. Run `hem env rm GITHUB_TOKEN` first.',
		});
	}

	const session = yield* getSession;
	const client = yield* HemApiClient;
	const authorization = yield* withAccessToken(
		session.accessToken,
		client.installations.startGithubInstallation()
	);

	yield* Console.log('Opening GitHub to install the Hem app…');
	yield* openBrowser(authorization.authorizationUrl);

	const installation = yield* pollUntilComplete({
		attempt: withAccessToken(
			session.accessToken,
			client.installations.getGithubInstallationStatus({
				query: { request_id: authorization.requestId },
			})
		).pipe(
			Effect.map(Option.some),
			Effect.catchTag('AuthorizationPending', () =>
				Effect.succeed(Option.none())
			)
		),
		expiresAt: authorization.expiresAt,
		timeoutMessage:
			'GitHub installation expired. Run `hem connect github` again.',
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
		bindingId: binding.id,
		connector: 'github',
		outputs: ['GITHUB_TOKEN'],
	});
	yield* Console.log(
		`✓ Connected GitHub account ${installation.account.name}`
	);
});
