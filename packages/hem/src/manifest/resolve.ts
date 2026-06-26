import { HemError } from '@hem/core/error';
import type { Entry } from '@hem/core/manifest/schema';
import { Effect } from 'effect';

import { BunSecret } from '../secret/bun';

export const resolveEntry = (entry: Entry) =>
	Effect.gen(function* () {
		const bunSecret = yield* BunSecret.Service;

		if (entry.provider) {
			return yield* new HemError({
				message: `Provider-backed env "${entry.provider}" is not supported locally. Use a managed GitHub binding via \`hem connect github\`.`,
			});
		}

		return yield* Effect.all(
			entry.vars.map((variable) =>
				Effect.gen(function* () {
					const value = yield* bunSecret.get({
						name: variable.source.name,
						service: variable.source.service,
					});

					if (!value) {
						return yield* new HemError({
							message: `No value for "${variable.label}" in the system keychain.`,
						});
					}

					return [variable.label, value] as const;
				})
			),
			{ concurrency: 'unbounded' }
		);
	});
