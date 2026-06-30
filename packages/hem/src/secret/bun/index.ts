import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import { Context, Data, Effect, Layer, Schema } from 'effect';

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

const FileStore = Schema.Struct({
	services: Schema.Record(
		Schema.String,
		Schema.Record(Schema.String, Schema.String)
	),
	version: Schema.Literal(1),
});
type FileStore = typeof FileStore.Type;

const emptyFileStore = (): FileStore => ({
	services: {},
	version: 1,
});

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

export const fileLayer = (file: string) =>
	Layer.effect(
		Service,
		Effect.sync(() => {
			const readStore = Effect.fn('BunSecret.file.readStore')(
				function* () {
					const exists = yield* Effect.tryPromise({
						catch: (cause) =>
							new BunSecretError({
								cause,
								message: `Failed to read test secret store "${file}".`,
							}),
						try: () => Bun.file(file).exists(),
					});
					if (!exists) return emptyFileStore();

					const json = yield* Effect.tryPromise({
						catch: (cause) =>
							new BunSecretError({
								cause,
								message: `Failed to read test secret store "${file}".`,
							}),
						try: () => Bun.file(file).json(),
					});

					return yield* Schema.decodeUnknownEffect(FileStore)(
						json
					).pipe(
						Effect.mapError(
							(cause) =>
								new BunSecretError({
									cause,
									message: `Test secret store "${file}" is invalid.`,
								})
						)
					);
				}
			);

			const writeStore = Effect.fn('BunSecret.file.writeStore')(
				function* (store: FileStore) {
					yield* Effect.tryPromise({
						catch: (cause) =>
							new BunSecretError({
								cause,
								message: `Failed to write test secret store "${file}".`,
							}),
						try: async () => {
							await mkdir(path.dirname(file), {
								recursive: true,
							});
							await Bun.write(
								file,
								`${JSON.stringify(store, null, 2)}\n`
							);
						},
					});
				}
			);

			const get = Effect.fn('BunSecret.file.get')(function* (
				input: Reference
			) {
				const store = yield* readStore();
				return store.services[input.service]?.[input.name] ?? null;
			});

			const set = Effect.fn('BunSecret.file.set')(function* (
				input: SetInput
			) {
				const store = yield* readStore();
				yield* writeStore({
					services: {
						...store.services,
						[input.service]: {
							...(store.services[input.service] ?? {}),
							[input.name]: input.value,
						},
					},
					version: 1,
				});
			});

			const remove = Effect.fn('BunSecret.file.remove')(function* (
				input: Reference
			) {
				const store = yield* readStore();
				const service = { ...(store.services[input.service] ?? {}) };
				delete service[input.name];

				const services = { ...store.services };
				if (Object.keys(service).length === 0) {
					delete services[input.service];
				} else {
					services[input.service] = service;
				}

				yield* writeStore({ services, version: 1 });
			});

			return Service.of({ get, remove, set });
		})
	);

export const defaultLayer = layer;

// oxlint-disable-next-line import/no-self-import, oxc/no-barrel-file -- namespace projection for Effect service module
export * as BunSecret from '.';
