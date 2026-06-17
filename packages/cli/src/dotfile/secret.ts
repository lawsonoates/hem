import { Brand, Data, Effect, FileSystem, Path, Schema } from 'effect';

const HEM_DIR = '.hem';
const FILENAME = 'secrets.json';

export namespace DotfileSecret {
	export const KeychainSource = Schema.Struct({
		name: Schema.String,
		service: Schema.String,
		type: Schema.Literal('keychain'),
	});

	export const Source = Schema.Union([KeychainSource]);
	export type Source = typeof Source.Type;

	export type VarId = string & Brand.Brand<'VarId'>;
	const VarId = Brand.make<VarId>((id) => id.startsWith('var_'));
	export const newVarId = (): VarId => VarId(`var_${crypto.randomUUID()}`);

	export const VarIdSchema = Schema.String.pipe(
		Schema.fromBrand('VarId', VarId)
	);

	export type EnvLabel = string & Brand.Brand<'EnvLabel'>;
	const EnvLabel = Brand.nominal<EnvLabel>();
	export const envLabel = (name: string): EnvLabel => EnvLabel(name);

	export const EnvLabelSchema = Schema.String.pipe(
		Schema.fromBrand('EnvLabel', EnvLabel)
	);

	export const Var = Schema.Struct({
		id: VarIdSchema,
		label: EnvLabelSchema,
		source: Source,
	});
	export type Var = typeof Var.Type;

	export const Entry = Schema.Struct({
		expiresOn: Schema.optional(Schema.String),
		issuedOn: Schema.optional(Schema.String),
		permissions: Schema.optional(Schema.Array(Schema.String)),
		provider: Schema.optional(Schema.String),
		tokenId: Schema.optional(Schema.String),
		vars: Schema.Array(Var),
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

	export const existingLabels = () =>
		read.pipe(
			Effect.map(
				(manifest) =>
					new Set(
						manifest.secrets.flatMap((entry) =>
							entry.vars.map((variable) => variable.label)
						)
					)
			)
		);

	/** Replace any bundle that shares a label with the new entry, otherwise append. */
	export const upsert = (entry: Entry) =>
		Effect.gen(function* () {
			const current = yield* read;
			const labels = new Set(
				entry.vars.map((variable) => variable.label)
			);
			const secrets = [
				...current.secrets.filter(
					(existing) =>
						!existing.vars.some((variable) =>
							labels.has(variable.label)
						)
				),
				entry,
			];
			yield* write({ secrets, version: 1 });
		});

	/** Remove the bundle containing `label`, returning it if found. */
	export const removeByLabel = (label: EnvLabel) =>
		Effect.gen(function* () {
			const current = yield* read;
			const removed = current.secrets.find((entry) =>
				entry.vars.some((variable) => variable.label === label)
			);
			if (!removed) return;

			yield* write({
				secrets: current.secrets.filter((entry) => entry !== removed),
				version: 1,
			});
			return removed;
		});
}
