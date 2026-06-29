import type {
	ManagedConnector,
	ProviderAccountType,
	ProviderCredentials,
} from '@hem/core/connector';
import { ManagedConnectorSchema } from '@hem/core/connector';
import type { Config } from 'effect';
import { Effect, Schema } from 'effect';

import type { GithubConnectorError } from './github';

export type ConnectorOutputs = readonly [string, ...string[]];

export interface ConnectorAccount {
	readonly id: string;
	readonly name: string;
	readonly type: ProviderAccountType;
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
	},
	{ httpApiStatus: 502 }
) {}

export type ManagedConnectorServiceError =
	| Config.ConfigError
	| ConnectorError
	| GithubConnectorError;

export interface ManagedConnectorService {
	readonly completeAuthorization: (input: {
		readonly callback: ConnectorAuthorizationCallback;
	}) => Effect.Effect<
		CompletedConnectorInstallation,
		ManagedConnectorServiceError
	>;
	readonly connector: ManagedConnector;
	readonly createAuthorizationUrl: (
		state: string
	) => Effect.Effect<string, ManagedConnectorServiceError>;
	readonly issueCredential: (
		input: IssueConnectorCredentialInput
	) => Effect.Effect<ConnectorCredentialLease, ManagedConnectorServiceError>;
	readonly outputsForInstallation: (
		account: ConnectorAccount
	) => ConnectorOutputs;
}

/**
 * Requires an OAuth authorization callback for OAuth-backed connectors.
 */
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

/**
 * Requires a GitHub App installation callback for GitHub.
 */
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
