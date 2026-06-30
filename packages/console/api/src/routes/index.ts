import { Layer } from 'effect';

import { BindingLive } from './binding';
import { CredentialLeaseLive } from './credential-lease';
import { InstallationLive } from './installation';

export const HandlersLive = Layer.mergeAll(
	BindingLive,
	CredentialLeaseLive,
	InstallationLive
);
