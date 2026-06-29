import {
	ManagedConnectorSchema,
	ProviderAccount,
	ProviderCredentials,
} from '@hem/core/connector';
import { Schema } from 'effect';

const Permissions = Schema.Record(Schema.String, Schema.String);

/** Input for creating or updating a persisted installation row. */
export const InstallationSave = Schema.Struct({
	account: ProviderAccount,
	connector: ManagedConnectorSchema,
	credentials: Schema.optional(Schema.NullOr(ProviderCredentials)),
	grantedPermissions: Permissions,
	id: Schema.optional(Schema.String),
	ownerId: Schema.String,
	providerInstallationId: Schema.String,
});
export type InstallationSave = typeof InstallationSave.Type;

/** Input for updating stored connector credentials. */
export const InstallationUpdateCredentials = Schema.Struct({
	credentials: Schema.NullOr(ProviderCredentials),
	grantedPermissions: Schema.optional(Permissions),
	id: Schema.String,
});
export type InstallationUpdateCredentials =
	typeof InstallationUpdateCredentials.Type;

/** Input for creating an installation authorization request. */
export const InstallationRequestCreate = Schema.Struct({
	expiresAt: Schema.instanceOf(Date),
	ownerId: Schema.String,
	state: Schema.String,
});

/** Input for completing an installation authorization request. */
export const InstallationRequestComplete = Schema.Struct({
	installationId: Schema.String,
	state: Schema.String,
});

/** Input for polling an installation authorization request. */
export const InstallationRequestPoll = Schema.Struct({
	ownerId: Schema.String,
	state: Schema.String,
});
