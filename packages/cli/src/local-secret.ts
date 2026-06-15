import { Effect } from 'effect';

import { BunSecret } from './bun-secret';
import { DotfileSecret } from './dotfile/secret';

export namespace LocalSecret {
	export const service = 'dev.hem.cli';

	export interface NameInput {
		readonly env: string;
		readonly provider: string;
	}

	export interface AddInput extends NameInput {
		readonly expiresOn?: string;
		readonly issuedOn?: string;
		readonly permissions?: readonly string[];
		readonly tokenId?: string;
		readonly value: string;
	}

	export const name = (input: NameInput) => `${input.provider}:${input.env}`;

	export const add = (input: AddInput) =>
		Effect.gen(function* () {
			const source: DotfileSecret.Source = {
				name: name(input),
				service,
				type: 'keychain',
			};

			yield* BunSecret.set({
				name: source.name,
				service: source.service,
				value: input.value,
			});

			const entry: DotfileSecret.Entry = {
				env: input.env,
				provider: input.provider,
				source,
				...(input.expiresOn === undefined
					? {}
					: { expiresOn: input.expiresOn }),
				...(input.issuedOn === undefined
					? {}
					: { issuedOn: input.issuedOn }),
				...(input.permissions === undefined
					? {}
					: { permissions: [...input.permissions] }),
				...(input.tokenId === undefined
					? {}
					: { tokenId: input.tokenId }),
			};

			yield* DotfileSecret.upsert(entry);

			return source;
		});

	export const list = DotfileSecret.read;

	export const resolve = (entry: DotfileSecret.Entry) =>
		BunSecret.get({
			name: entry.source.name,
			service: entry.source.service,
		});

	export const remove = (env: string) =>
		Effect.gen(function* () {
			const removed = yield* DotfileSecret.remove(env);

			if (!removed) return;

			yield* BunSecret.remove({
				name: removed.source.name,
				service: removed.source.service,
			});

			return removed;
		});
}
