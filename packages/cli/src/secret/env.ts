import type { Provider } from '@hem/provider';

import type { DotfileSecret } from '../dotfile/secret';

export namespace EnvSecret {
	export const service = 'hem.env';

	export interface NameInput {
		readonly env: DotfileSecret.EnvLabel;
		readonly provider: Provider;
	}

	export const name = (input: NameInput) => `${input.provider}:${input.env}`;
}
