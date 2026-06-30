import { BunServices } from '@effect/platform-bun';
import { Config, Effect, Layer, Option } from 'effect';
import { FetchHttpClient } from 'effect/unstable/http';

import { layerHemApiClient } from '../api/client';
import { Manifest } from '../manifest';
import { BunSecret } from '../secret/bun';

const SecretLayer = Layer.unwrap(
	Effect.gen(function* () {
		const file = yield* Config.option(
			Config.string('HEM_TEST_SECRET_STORE')
		);
		return Option.match(file, {
			onNone: () => BunSecret.defaultLayer,
			onSome: BunSecret.fileLayer,
		});
	})
);

export const LocalLayer = Layer.mergeAll(SecretLayer, Manifest.defaultLayer);

export const CloudLayer = layerHemApiClient.pipe(
	Layer.provideMerge(FetchHttpClient.layer)
);

export const CliAppLayer = Layer.mergeAll(
	BunServices.layer,
	LocalLayer,
	CloudLayer
);

/** Domain services for scripts and tests. */
export const AppLayer = Layer.mergeAll(LocalLayer, CloudLayer);
