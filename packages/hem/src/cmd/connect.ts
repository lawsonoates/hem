import { CONNECTOR_LABELS, MANAGED_CONNECTORS } from '@hem/core/connector';
import type { ManagedConnector } from '@hem/core/connector';
import { Command } from 'effect/unstable/cli';

import { connectProvider } from '../control/cloud/provider';

const providerCommand = (connector: ManagedConnector) =>
	Command.make(connector, {}, () => connectProvider(connector)).pipe(
		Command.withDescription(
			`Connect ${CONNECTOR_LABELS[connector]} to this project`
		)
	);

export const connectCommand = Command.make('connect').pipe(
	Command.withDescription('Connect Hem to a provider'),
	Command.withSubcommands(MANAGED_CONNECTORS.map(providerCommand))
);