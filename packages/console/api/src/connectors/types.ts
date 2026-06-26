import type { ProviderCredentials } from '@hem/console-core/database/schema/installation';
import { ManagedConnector as ManagedConnectorSchema } from '@hem/core/connector';
import type { ManagedConnector } from '@hem/core/connector';
import { Effect, Schema } from 'effect';

export type ConnectorOutputs = readonly [string, ...string[]];

export interface ConnectorAccount {
	readonly id: string;
	readonly name: string;
	readonly type: string;
}

export type ConnectorAuthorizationCallback =
	| {
			readonly _tag: 'github';
			readonly providerInstallationId: string;
	  }
	| {
			readonly _tag: 'oauth';
			readonly code: string;
	  };

export interface CompletedConnectorInstallation {
	readonly account: ConnectorAccount;
	readonly credentials: ProviderCredentials | null;
	readonly grantedPermissions: Readonly<Record<string, string>>;
	readonly providerInstallationId: string;
}

export interface IssueConnectorCredentialInput {
	readonly credentials: ProviderCredentials | null;
	readonly grantedPermissions: Readonly<Record<string, string>>;
	readonly providerInstallationId: string;
}

export interface ConnectorCredentialLease {
	readonly credentials?: ProviderCredentials;
	readonly expiresAt: string;
	readonly grantedPermissions?: Readonly<Record<string, string>>;
	readonly values: Readonly<Record<string, string>>;
}

export class ConnectorError extends Schema.TaggedErrorClass<ConnectorError>()(
	'ConnectorError',
	{
		cause: Schema.optional(Schema.Defect),
		connector: ManagedConnectorSchema,
		message: Schema.String,
	}
) {}

export interface ManagedConnectorService {
	readonly completeAuthorization: (input: {
		readonly callback: ConnectorAuthorizationCallback;
	}) => Effect.Effect<CompletedConnectorInstallation, ConnectorError>;
	readonly connector: ManagedConnector;
	readonly createAuthorizationUrl: (
		state: string
	) => Effect.Effect<string, ConnectorError>;
	readonly issueCredential: (
		input: IssueConnectorCredentialInput
	) => Effect.Effect<ConnectorCredentialLease, ConnectorError>;
	readonly outputsForInstallation: (
		account: ConnectorAccount
	) => ConnectorOutputs;
}

export const requireOAuthCode = (
	connector: ManagedConnector,
	callback: ConnectorAuthorizationCallback
) => {
	if (callback._tag === 'oauth') return Effect.succeed(callback.code);

	return Effect.fail(
		new ConnectorError({
			connector,
			message: `${connector} requires an OAuth code callback.`,
		})
	);
};

export const requireGithubInstallationId = (
	connector: ManagedConnector,
	callback: ConnectorAuthorizationCallback
) => {
	if (callback._tag === 'github')
		return Effect.succeed(callback.providerInstallationId);

	return Effect.fail(
		new ConnectorError({
			connector,
			message: `${connector} requires a GitHub installation callback.`,
		})
	);
};
