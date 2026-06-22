import { Command } from 'effect/unstable/cli';

import { connectGithub } from '../control/cloud/github';

const github = Command.make('github', {}, () => connectGithub).pipe(
	Command.withDescription(
		'Install the Hem GitHub App and connect it to this project'
	)
);

export const connectCommand = Command.make('connect').pipe(
	Command.withDescription('Connect Hem to a provider'),
	Command.withSubcommands([github])
);