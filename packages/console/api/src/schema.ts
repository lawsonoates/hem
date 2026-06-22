import { Schema } from 'effect';

export const HemUserId = Schema.String.pipe(Schema.brand('HemUserId'));
export type HemUserId = typeof HemUserId.Type;

export const InstallationId = Schema.String.pipe(
	Schema.brand('InstallationId')
);
export type InstallationId = typeof InstallationId.Type;

export const BindingId = Schema.String.pipe(Schema.brand('BindingId'));
export type BindingId = typeof BindingId.Type;

export class GithubAccount extends Schema.Class<GithubAccount>(
	'@hem/console-api/GithubAccount'
)({
	id: Schema.String,
	name: Schema.String,
	type: Schema.Literals(['user', 'organization']),
}) {}

export class Installation extends Schema.Class<Installation>(
	'@hem/console-api/Installation'
)({
	account: GithubAccount,
	connector: Schema.Literal('github'),
	id: InstallationId,
	providerInstallationId: Schema.String,
}) {}

export class Binding extends Schema.Class<Binding>('@hem/console-api/Binding')({
	id: BindingId,
	installationId: InstallationId,
}) {}

export class CredentialLease extends Schema.Class<CredentialLease>(
	'@hem/console-api/CredentialLease'
)({
	expiresAt: Schema.String,
	values: Schema.Record(Schema.String, Schema.String),
}) {}

export class GithubInstallationAuthorization extends Schema.Class<GithubInstallationAuthorization>(
	'@hem/console-api/GithubInstallationAuthorization'
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

export class DeviceClaim extends Schema.Class<DeviceClaim>(
	'@hem/console-api/DeviceClaim'
)({
	status: Schema.Literals(['pending', 'approved', 'denied']),
	user_code: Schema.String,
}) {}

export class ApproveDeviceRequest extends Schema.Class<ApproveDeviceRequest>(
	'@hem/console-api/ApproveDeviceRequest'
)({
	userCode: Schema.String,
}) {}

export class AuthSuccess extends Schema.Class<AuthSuccess>(
	'@hem/console-api/AuthSuccess'
)({
	success: Schema.Boolean,
}) {}

export class EmailSignInRequest extends Schema.Class<EmailSignInRequest>(
	'@hem/console-api/EmailSignInRequest'
)({
	email: Schema.String,
	password: Schema.String,
}) {}

export class EmailSignUpRequest extends Schema.Class<EmailSignUpRequest>(
	'@hem/console-api/EmailSignUpRequest'
)({
	email: Schema.String,
	name: Schema.String,
	password: Schema.String,
}) {}

export class AuthUser extends Schema.Class<AuthUser>(
	'@hem/console-api/AuthUser'
)({
	email: Schema.String,
	id: Schema.optional(Schema.String),
	name: Schema.String,
}) {}

export class AuthSession extends Schema.Class<AuthSession>(
	'@hem/console-api/AuthSession'
)({
	session: Schema.Struct({
		expiresAt: Schema.String,
		token: Schema.String,
		userId: Schema.String,
	}),
	user: AuthUser,
}) {}
