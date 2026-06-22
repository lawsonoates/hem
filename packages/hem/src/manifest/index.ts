import { BunServices } from '@effect/platform-bun';
import { InvalidSecretsManifest } from '@hem/core/error';
import {
	envLabel,
	Manifest as ManifestSchema,
} from '@hem/core/manifest/schema';
import type {
	Entry,
	EnvLabel,
	ManagedBinding,
	Manifest,
} from '@hem/core/manifest/schema';
import { Context, Effect, FileSystem, Layer, Path, Schema } from 'effect';
import type { PlatformError } from 'effect/PlatformError';

const HEM_DIR = '.hem';
const FILENAME = 'secrets.json';

const EMPTY_MANIFEST: Manifest = { secrets: [], version: 1 };

const decode = Schema.decodeEffect(Schema.fromJsonString(ManifestSchema));

type ManifestError = InvalidSecretsManifest | PlatformError;

export interface Interface {
	readonly read: () => Effect.Effect<Manifest, ManifestError>;
	readonly existingLabels: () => Effect.Effect<
		ReadonlySet<EnvLabel>,
		ManifestError
	>;
	readonly upsert: (entry: Entry) => Effect.Effect<void, ManifestError>;
	readonly upsertManagedBinding: (
		binding: ManagedBinding
	) => Effect.Effect<void, ManifestError>;
	readonly replaceEntry: (entry: Entry) => Effect.Effect<void, ManifestError>;
	readonly removeByLabel: (
		label: EnvLabel
	) => Effect.Effect<Entry | undefined, ManifestError>;
	readonly removeManagedBindingByOutput: (
		label: EnvLabel
	) => Effect.Effect<ManagedBinding | undefined, ManifestError>;
}

export class Service extends Context.Service<Service, Interface>()(
	'@hem/hem/Manifest'
) {}

export const layer = Layer.effect(
	Service,
	Effect.gen(function* () {
		const fs = yield* FileSystem.FileSystem;
		const path = yield* Path.Path;
		const dir = path.join(process.cwd(), HEM_DIR);
		const file = path.join(dir, FILENAME);

		const read = Effect.fn('Manifest.read')(function* () {
			if (!(yield* fs.exists(file))) return EMPTY_MANIFEST;

			const content = yield* fs.readFileString(file);
			return yield* decode(content).pipe(
				Effect.mapError(
					() => new InvalidSecretsManifest({ path: file })
				)
			);
		});

		const write = Effect.fn('Manifest.write')(function* (
			manifest: Manifest
		) {
			yield* fs.makeDirectory(dir, { recursive: true });
			yield* fs.writeFileString(
				file,
				`${JSON.stringify(manifest, null, 2)}\n`
			);
		});

		const existingLabels = Effect.fn('Manifest.existingLabels')(
			function* () {
				const manifest = yield* read();
				return new Set([
					...manifest.secrets.flatMap((entry) =>
						entry.vars.map((variable) => variable.label)
					),
					...(manifest.bindings ?? []).flatMap((binding) =>
						binding.outputs.map((output) => envLabel(output))
					),
				]);
			}
		);

		const upsert = Effect.fn('Manifest.upsert')(function* (entry: Entry) {
			const current = yield* read();
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
			yield* write({
				bindings: current.bindings,
				secrets,
				version: 1,
			});
		});

		const upsertManagedBinding = Effect.fn('Manifest.upsertManagedBinding')(
			function* (binding: ManagedBinding) {
				const current = yield* read();
				const bindings = [
					...(current.bindings ?? []).filter(
						(existing) => existing.connector !== binding.connector
					),
					binding,
				];
				yield* write({
					bindings,
					secrets: current.secrets,
					version: 1,
				});
			}
		);

		const replaceEntry = Effect.fn('Manifest.replaceEntry')(function* (
			entry: Entry
		) {
			const current = yield* read();
			const labels = new Set(
				entry.vars.map((variable) => variable.label)
			);
			const existing = current.secrets.find((candidate) =>
				candidate.vars.some((variable) => labels.has(variable.label))
			);

			if (!existing) {
				yield* upsert(entry);
				return;
			}

			const secrets = current.secrets.map((candidate) =>
				candidate === existing ? entry : candidate
			);
			yield* write({
				bindings: current.bindings,
				secrets,
				version: 1,
			});
		});

		const removeByLabel = Effect.fn('Manifest.removeByLabel')(function* (
			label: EnvLabel
		) {
			const current = yield* read();
			const removed = current.secrets.find((entry) =>
				entry.vars.some((variable) => variable.label === label)
			);
			if (!removed) return;

			yield* write({
				bindings: current.bindings,
				secrets: current.secrets.filter((entry) => entry !== removed),
				version: 1,
			});
			return removed;
		});

		const removeManagedBindingByOutput = Effect.fn(
			'Manifest.removeManagedBindingByOutput'
		)(function* (label: EnvLabel) {
			const current = yield* read();
			const removed = current.bindings?.find((binding) =>
				binding.outputs.includes(label)
			);
			if (!removed) return;

			yield* write({
				bindings: current.bindings?.filter(
					(binding) => binding !== removed
				),
				secrets: current.secrets,
				version: 1,
			});
			return removed;
		});

		return Service.of({
			existingLabels,
			read,
			removeByLabel,
			removeManagedBindingByOutput,
			replaceEntry,
			upsert,
			upsertManagedBinding,
		});
	})
);

export const defaultLayer = layer.pipe(Layer.provide(BunServices.layer));

// oxlint-disable-next-line import/no-self-import, oxc/no-barrel-file -- namespace projection for Effect service module
export * as Manifest from '.';
