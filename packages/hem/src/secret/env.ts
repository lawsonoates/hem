import type { EnvLabel } from '@hem/core/manifest/schema';

export namespace EnvSecret {
	export const service = 'hem.env';

	export const manualName = (env: EnvLabel) => `manual:${env}`;
}
