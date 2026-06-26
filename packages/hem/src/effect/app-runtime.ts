import { BunServices } from '@effect/platform-bun';
import { Layer } from 'effect';
import { FetchHttpClient } from 'effect/unstable/http';

import { layerHemApiClient } from '../api/client';
import { Manifest } from '../manifest';
import { BunSecret } from '../secret/bun';

export const LocalLayer = Layer.mergeAll(
	BunSecret.defaultLayer,
	Manifest.defaultLayer
);

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
