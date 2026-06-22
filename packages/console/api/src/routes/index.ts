import { Layer } from 'effect';

import { AuthLive } from './auth';
import { BindingLive } from './binding';
import { CredentialLeaseLive } from './credential-lease';
import { InstallationLive } from './installation';

export const HandlersLive = Layer.mergeAll(
	AuthLive,
	BindingLive,
	CredentialLeaseLive,
	InstallationLive
);