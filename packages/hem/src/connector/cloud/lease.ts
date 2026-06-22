import { HemError } from '@hem/core/error';
import {
	BindingId,
	CreateCredentialLeaseRequest,
} from '@hem/console-api/schema';
import { Effect } from 'effect';

import { HemApiClient, withAccessToken } from '../../api/client';
import { getSession } from '../../auth/session';
import type { ManagedBinding } from '@hem/core/manifest/schema';

export const resolveManagedBindings = (
	bindings: readonly ManagedBinding[]
) =>
	Effect.gen(function* () {
		if (bindings.length === 0) return [];

		const session = yield* getSession;
		const client = yield* HemApiClient;
		return yield* Effect.all(
			bindings.map((binding) =>
				Effect.gen(function* () {
					const lease = yield* withAccessToken(
						session.accessToken,
						client.credentialLeases.createCredentialLease({
							payload: new CreateCredentialLeaseRequest({
								bindingId: BindingId.make(binding.bindingId),
							}),
						})
					);
					return yield* Effect.all(
						binding.outputs.map((output) => {
							const value = lease.values[output];
							return value
								? Effect.succeed([output, value] as const)
								: Effect.fail(
										new HemError({
											message: `Hem did not return the expected "${output}" value.`,
										})
									);
						})
					);
				})
			),
			{ concurrency: 'unbounded' }
		).pipe(Effect.map((resolved) => resolved.flat()));
	});