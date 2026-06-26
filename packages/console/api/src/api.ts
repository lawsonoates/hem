import { ManagedConnector as ManagedConnectorSchema } from '@hem/core/connector';
import { Schema } from 'effect';
import {
	HttpApi,
	HttpApiEndpoint,
	HttpApiGroup,
} from 'effect/unstable/httpapi';

import {
	AuthRequestError,
	AuthorizationPending,
	DeviceAuthorizationPending,
	DeviceAuthorizationSlowDown,
	Forbidden,
	InvalidAuthorization,
	InvalidInstallationState,
	NotFound,
	ProviderUnavailable,
} from './errors';
import { Authorization } from './middleware/auth';
import {
	ApproveDeviceRequest,
	AuthSession,
	AuthSuccess,
	AuthUser,
	Binding,
	ConnectorInstallationAuthorization,
	CreateBindingRequest,
	CreateCredentialLeaseRequest,
	CredentialLease,
	DeviceAccessToken,
	DeviceAuthorization,
	DeviceClaim,
	EmailSignInRequest,
	EmailSignUpRequest,
	ExchangeDeviceTokenRequest,
	Installation,
	StartDeviceAuthorizationRequest,
} from './schema';

const startDeviceAuthorization = HttpApiEndpoint.post(
	'startDeviceAuthorization',
	'/auth/device/code',
	{
		error: AuthRequestError,
		payload: StartDeviceAuthorizationRequest,
		success: DeviceAuthorization,
	}
);

const exchangeDeviceToken = HttpApiEndpoint.post(
	'exchangeDeviceToken',
	'/auth/device/token',
	{
		error: [
			AuthRequestError,
			DeviceAuthorizationPending,
			DeviceAuthorizationSlowDown,
		],
		payload: ExchangeDeviceTokenRequest,
		success: DeviceAccessToken,
	}
);

const getDeviceClaim = HttpApiEndpoint.get('getDeviceClaim', '/auth/device', {
	error: AuthRequestError,
	query: { user_code: Schema.String },
	success: DeviceClaim,
});

const approveDevice = HttpApiEndpoint.post(
	'approveDevice',
	'/auth/device/approve',
	{
		error: AuthRequestError,
		payload: ApproveDeviceRequest,
		success: AuthSuccess,
	}
);

const signInEmail = HttpApiEndpoint.post('signInEmail', '/auth/sign-in/email', {
	error: AuthRequestError,
	payload: EmailSignInRequest,
	success: Schema.Struct({ user: AuthUser }),
});

const signUpEmail = HttpApiEndpoint.post('signUpEmail', '/auth/sign-up/email', {
	error: AuthRequestError,
	payload: EmailSignUpRequest,
	success: Schema.Struct({ user: AuthUser }),
});

const getSession = HttpApiEndpoint.get('getSession', '/auth/get-session', {
	error: AuthRequestError,
	success: Schema.NullOr(AuthSession),
});

const signOut = HttpApiEndpoint.post('signOut', '/auth/sign-out', {
	error: AuthRequestError,
	success: AuthSuccess,
});

export class AuthApi extends HttpApiGroup.make('auth').add(
	startDeviceAuthorization,
	exchangeDeviceToken,
	getDeviceClaim,
	approveDevice,
	signInEmail,
	signUpEmail,
	getSession,
	signOut
) {}

const startConnectorInstallation = HttpApiEndpoint.post(
	'startConnectorInstallation',
	'/connectors/:connector/installations',
	{
		error: ProviderUnavailable,
		params: { connector: ManagedConnectorSchema },
		success: ConnectorInstallationAuthorization,
	}
).middleware(Authorization);

const completeConnectorInstallation = HttpApiEndpoint.get(
	'completeConnectorInstallation',
	'/connectors/:connector/callback',
	{
		error: [InvalidInstallationState, ProviderUnavailable],
		params: { connector: ManagedConnectorSchema },
		query: {
			code: Schema.optional(Schema.String),
			installation_id: Schema.optional(Schema.String),
			state: Schema.String,
		},
		success: Installation,
	}
);

const getConnectorInstallationStatus = HttpApiEndpoint.get(
	'getConnectorInstallationStatus',
	'/connectors/:connector/installations/status',
	{
		error: [AuthorizationPending, InvalidAuthorization, NotFound],
		params: { connector: ManagedConnectorSchema },
		query: { request_id: Schema.String },
		success: Installation,
	}
).middleware(Authorization);

export class InstallationsApi extends HttpApiGroup.make('installations').add(
	startConnectorInstallation,
	completeConnectorInstallation,
	getConnectorInstallationStatus
) {}

const createBinding = HttpApiEndpoint.post('createBinding', '/bindings', {
	error: [Forbidden, NotFound],
	payload: CreateBindingRequest,
	success: Binding,
}).middleware(Authorization);

export class BindingsApi extends HttpApiGroup.make('bindings').add(
	createBinding
) {}

const createCredentialLease = HttpApiEndpoint.post(
	'createCredentialLease',
	'/credential-leases',
	{
		error: [Forbidden, NotFound, ProviderUnavailable],
		payload: CreateCredentialLeaseRequest,
		success: CredentialLease,
	}
).middleware(Authorization);

export class CredentialLeasesApi extends HttpApiGroup.make(
	'credentialLeases'
).add(createCredentialLease) {}

export class HemApi extends HttpApi.make('hem-api')
	.add(AuthApi)
	.add(InstallationsApi)
	.add(BindingsApi)
	.add(CredentialLeasesApi)
	.prefix('/v1') {}