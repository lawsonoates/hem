import type { Provider } from '@hem/provider';

export namespace ProviderSecret {
	export const service = 'hem.provider';

	export interface NameInput {
		readonly key: string;
		readonly provider: Provider;
	}

	export const name = (input: NameInput) => `${input.provider}:${input.key}`;
}
