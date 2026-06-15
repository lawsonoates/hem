import type { Provider } from '@hem/provider';

export namespace EnvSecret {
	export const service = 'hem.env';

	export interface NameInput {
		readonly env: string;
		readonly provider: Provider;
	}

	export const name = (input: NameInput) => `${input.provider}:${input.env}`;
}
