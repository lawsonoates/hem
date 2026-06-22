import { Binding as BindingCore } from '@hem/console-core/binding';
import { Installation as InstallationCore } from '@hem/console-core/installation';
import { Effect } from 'effect';
import { HttpApiBuilder } from 'effect/unstable/httpapi';

import { HemApi } from '../api';
import { Forbidden, NotFound } from '../errors';
import { CurrentUser } from '../middleware/auth';
import { Binding, BindingId, InstallationId } from '../schema';
import type { CreateBindingRequest } from '../schema';

export const createBinding = (ownerId: string, request: CreateBindingRequest) =>
	Effect.gen(function* () {
		const installation = yield* InstallationCore.fromId(
			request.installationId
		).pipe(Effect.orDie);
		if (!installation) {
			return yield* new NotFound({
				message: 'Installation was not found.',
			});
		}
		if (installation.ownerId !== ownerId) {
			return yield* new Forbidden({
				message: 'Installation belongs to another user.',
			});
		}
		const binding = yield* BindingCore.create({
			installationId: installation.id,
		}).pipe(Effect.orDie);
		return new Binding({
			id: BindingId.make(binding.id),
			installationId: InstallationId.make(binding.installationId),
		});
	});

export const BindingLive = HttpApiBuilder.group(
	HemApi,
	'bindings',
	(handlers) =>
		handlers.handle('createBinding', ({ payload }) =>
			Effect.gen(function* () {
				const user = yield* CurrentUser;
				return yield* createBinding(user.id, payload);
			})
		)
);
