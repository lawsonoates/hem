import {
	ManagedConnectorSchema,
	OAuthConnectorSchema,
	ProviderAccount as CoreProviderAccount,
} from '@hem/core/connector';
import { Schema } from 'effect';

export const HemUserId = Schema.String.pipe(Schema.brand('HemUserId'));
export type HemUserId = typeof HemUserId.Type;

export const InstallationId = Schema.String.pipe(
	Schema.brand('InstallationId')
);
export type InstallationId = typeof InstallationId.Type;

export const BindingId = Schema.String.pipe(Schema.brand('BindingId'));
export type BindingId = typeof BindingId.Type;

export const Connector = ManagedConnectorSchema;
export type Connector = typeof Connector.Type;

export const OAuthConnector = OAuthConnectorSchema;
export type OAuthConnector = typeof OAuthConnector.Type;

export const ProviderAccount = CoreProviderAccount;
export type ProviderAccount = typeof ProviderAccount.Type;

export class Installation extends Schema.Class<Installation>(
	'@hem/console-api/Installation'
)({
	account: ProviderAccount,
	connector: Connector,
	id: InstallationId,
	providerInstallationId: Schema.String,
}) {}

export class Binding extends Schema.Class<Binding>('@hem/console-api/Binding')({
	connector: Connector,
	id: BindingId,
	installationId: InstallationId,
	outputs: Schema.NonEmptyArray(Schema.String),
}) {}

export class CredentialLease extends Schema.Class<CredentialLease>(
	'@hem/console-api/CredentialLease'
)({
	expiresAt: Schema.String,
	values: Schema.Record(Schema.String, Schema.String),
}) {}

export class ConnectorInstallationAuthorization extends Schema.Class<ConnectorInstallationAuthorization>(
	'@hem/console-api/ConnectorInstallationAuthorization'
)({
	authorizationUrl: Schema.String,
	expiresAt: Schema.String,
	requestId: Schema.String,
}) {}

export class CreateBindingRequest extends Schema.Class<CreateBindingRequest>(
	'@hem/console-api/CreateBindingRequest'
)({
	installationId: InstallationId,
}) {}

export class CreateCredentialLeaseRequest extends Schema.Class<CreateCredentialLeaseRequest>(
	'@hem/console-api/CreateCredentialLeaseRequest'
)({
	bindingId: BindingId,
}) {}

export const DEVICE_CLIENT_ID = 'hem-cli';

export const DEVICE_GRANT =
	'urn:ietf:params:oauth:grant-type:device_code' as const;

export class StartDeviceAuthorizationRequest extends Schema.Class<StartDeviceAuthorizationRequest>(
	'@hem/console-api/StartDeviceAuthorizationRequest'
)({
	client_id: Schema.String,
}) {}

export class DeviceAuthorization extends Schema.Class<DeviceAuthorization>(
	'@hem/console-api/DeviceAuthorization'
)({
	device_code: Schema.String,
	expires_in: Schema.Number,
	interval: Schema.Number,
	user_code: Schema.String,
	verification_uri: Schema.String,
	verification_uri_complete: Schema.String,
}) {}

export class ExchangeDeviceTokenRequest extends Schema.Class<ExchangeDeviceTokenRequest>(
	'@hem/console-api/ExchangeDeviceTokenRequest'
)({
	client_id: Schema.String,
	device_code: Schema.String,
	grant_type: Schema.Literal(DEVICE_GRANT),
}) {}

export class DeviceAccessToken extends Schema.Class<DeviceAccessToken>(
	'@hem/console-api/DeviceAccessToken'
)({
	access_token: Schema.String,
	expires_in: Schema.Number,
	scope: Schema.String,
	token_type: Schema.String,
}) {}
