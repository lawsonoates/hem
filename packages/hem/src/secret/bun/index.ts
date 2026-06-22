import { Context, Data, Effect, Layer } from 'effect';

export interface Reference {
	readonly name: string;
	readonly service: string;
}

export interface SetInput extends Reference {
	readonly value: string;
}

export class BunSecretError extends Data.TaggedError('BunSecretError')<{
	readonly cause: unknown;
	readonly message: string;
}> {}

export interface Interface {
	readonly get: (
		input: Reference
	) => Effect.Effect<string | null, BunSecretError>;
	readonly set: (input: SetInput) => Effect.Effect<void, BunSecretError>;
	readonly remove: (input: Reference) => Effect.Effect<void, BunSecretError>;
}

export class Service extends Context.Service<Service, Interface>()(
	'@hem/hem/BunSecret'
) {}

export const layer = Layer.effect(
	Service,
	Effect.sync(() => {
		const get = Effect.fn('BunSecret.get')(function* (input: Reference) {
			return yield* Effect.tryPromise({
				catch: (cause) =>
					new BunSecretError({
						cause,
						message: `Failed to read secret "${input.name}" from the system keychain.`,
					}),
				try: () =>
					Bun.secrets.get({
						name: input.name,
						service: input.service,
					}),
			});
		});

		const set = Effect.fn('BunSecret.set')(function* (input: SetInput) {
			yield* Effect.tryPromise({
				catch: (cause) =>
					new BunSecretError({
						cause,
						message: `Failed to store secret "${input.name}" in the system keychain.`,
					}),
				try: () =>
					Bun.secrets.set({
						name: input.name,
						service: input.service,
						value: input.value,
					}),
			});
		});

		const remove = Effect.fn('BunSecret.remove')(function* (
			input: Reference
		) {
			yield* Effect.tryPromise({
				catch: (cause) =>
					new BunSecretError({
						cause,
						message: `Failed to delete secret "${input.name}" from the system keychain.`,
					}),
				try: () =>
					Bun.secrets.delete({
						name: input.name,
						service: input.service,
					}),
			});
		});

		return Service.of({ get, remove, set });
	})
);

export const defaultLayer = layer;

// oxlint-disable-next-line import/no-self-import, oxc/no-barrel-file -- namespace projection for Effect service module
export * as BunSecret from '.';