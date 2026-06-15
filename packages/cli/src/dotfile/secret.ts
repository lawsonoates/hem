import { Data, Effect, FileSystem, Path, Schema } from 'effect';

const HEM_DIR = '.hem';
const FILENAME = 'secrets.json';

export namespace DotfileSecret {
	/** Where a value physically lives on this machine. */
	export const KeychainSource = Schema.Struct({
		/** The Bun.secrets key. */
		name: Schema.String,
		/** For example, "dev.hem.cli". */
		service: Schema.String,
		type: Schema.Literal('keychain'),
	});

	export const Source = Schema.Union([KeychainSource]);
	export type Source = typeof Source.Type;

	/** One injected env var. */
	export const Entry = Schema.Struct({
		/** For example, "CLOUDFLARE_API_TOKEN". */
		env: Schema.String,
		expiresOn: Schema.optional(Schema.String),
		issuedOn: Schema.optional(Schema.String),
		permissions: Schema.optional(Schema.Array(Schema.String)),
		/** For example, "cloudflare". */
		provider: Schema.optional(Schema.String),
		source: Source,
		tokenId: Schema.optional(Schema.String),
	});
	export type Entry = typeof Entry.Type;

	export const Manifest = Schema.Struct({
		secrets: Schema.Array(Entry),
		version: Schema.Literal(1),
	});
	export type Manifest = typeof Manifest.Type;

	const EMPTY_MANIFEST: Manifest = { secrets: [], version: 1 };

	/** Raised when `.hem/secrets.json` exists but does not match the schema. */
	export class InvalidSecretsManifest extends Data.TaggedError(
		'InvalidSecretsManifest'
	)<{ readonly path: string }> {
		override get message() {
			return `Invalid secrets manifest at ${this.path}`;
		}
	}

	const decode = Schema.decodeEffect(Schema.fromJsonString(Manifest));

	const paths = Effect.gen(function* () {
		const path = yield* Path.Path;
		const dir = path.join(process.cwd(), HEM_DIR);
		return { dir, file: path.join(dir, FILENAME) } as const;
	});

	/** Load `.hem/secrets.json`; a missing file is treated as an empty manifest. */
	export const read = Effect.gen(function* () {
		const fs = yield* FileSystem.FileSystem;
		const { file } = yield* paths;

		if (!(yield* fs.exists(file))) return EMPTY_MANIFEST;

		const content = yield* fs.readFileString(file);
		return yield* decode(content).pipe(
			Effect.mapError(() => new InvalidSecretsManifest({ path: file }))
		);
	});

	const write = (manifest: Manifest) =>
		Effect.gen(function* () {
			const fs = yield* FileSystem.FileSystem;
			const { dir, file } = yield* paths;
			yield* fs.makeDirectory(dir, { recursive: true });
			yield* fs.writeFileString(
				file,
				`${JSON.stringify(manifest, null, 2)}\n`
			);
		});

	/** Replace the entry with the same `env`, otherwise append. */
	export const upsert = (entry: Entry) =>
		Effect.gen(function* () {
			const current = yield* read;
			const secrets = [
				...current.secrets.filter(
					(existing) => existing.env !== entry.env
				),
				entry,
			];
			yield* write({ secrets, version: 1 });
		});

	/** Remove an env entry from the manifest, returning the removed entry if found. */
	export const remove = (env: string) =>
		Effect.gen(function* () {
			const current = yield* read;
			const removed = current.secrets.find((entry) => entry.env === env);
			if (!removed) return;

			yield* write({
				secrets: current.secrets.filter((entry) => entry.env !== env),
				version: 1,
			});
			return removed;
		});
}
