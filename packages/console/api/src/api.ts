import { DbError } from '@hem/console-core/database/database';
import { ManagedConnectorSchema } from '@hem/core/connector';
import { Schema } from 'effect';
import {
	HttpApi,
	HttpApiEndpoint,
	HttpApiGroup,
} from 'effect/unstable/httpapi';

import { ConnectorError } from './connectors/types';
import {
	AuthorizationPending,
	BadRequest,
	Forbidden,
	InvalidAuthorization,
	InvalidInstallationState,
	NotFound,
} from './errors';
import { Authorization } from './middleware/auth';
import {
	Binding,
	ConnectorInstallationAuthorization,
	CreateBindingRequest,
	CreateCredentialLeaseRequest,
	CredentialLease,
	Installation,
} from './schema';

const startConnectorInstallation = HttpApiEndpoint.post(
	'startConnectorInstallation',
	'/connectors/:connector/installations',
	{
		error: [BadRequest, ConnectorError, DbError],
		params: { connector: ManagedConnectorSchema },
		success: ConnectorInstallationAuthorization,
	}
).middleware(Authorization);

const completeConnectorInstallation = HttpApiEndpoint.get(
	'completeConnectorInstallation',
	'/connectors/:connector/callback',
	{
		error: [BadRequest, ConnectorError, DbError, InvalidInstallationState],
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
		error: [
			AuthorizationPending,
			BadRequest,
			DbError,
			InvalidAuthorization,
			NotFound,
		],
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
	error: [BadRequest, DbError, Forbidden, NotFound],
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
		error: [BadRequest, ConnectorError, DbError, Forbidden, NotFound],
		payload: CreateCredentialLeaseRequest,
		success: CredentialLease,
	}
).middleware(Authorization);

export class CredentialLeasesApi extends HttpApiGroup.make(
	'credentialLeases'
).add(createCredentialLease) {}

export class HemApi extends HttpApi.make('hem-api')
	.add(InstallationsApi)
	.add(BindingsApi)
	.add(CredentialLeasesApi)
	.prefix('/v1') {}
