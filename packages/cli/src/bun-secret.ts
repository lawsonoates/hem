import { Data, Effect } from 'effect';

export namespace BunSecret {
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

	export const get = (input: Reference) =>
		Effect.tryPromise({
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

	export const set = (input: SetInput) =>
		Effect.tryPromise({
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

	export const remove = (input: Reference) =>
		Effect.tryPromise({
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
}
