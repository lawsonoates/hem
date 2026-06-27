import { Effect, Schema } from 'effect';

export type ManagedConnector =
	| 'github'
	| 'notion'
	| 'planetscale'
	| 'slack'
	| 'vercel';

export type OAuthConnector = 'notion' | 'planetscale' | 'slack' | 'vercel';

/** Managed connector identifiers supported by the Hem control plane. */
export const MANAGED_CONNECTORS = [
	'github',
	'notion',
	'planetscale',
	'slack',
	'vercel',
] as const satisfies readonly ManagedConnector[];

/** OAuth-backed managed connectors. */
export const OAUTH_CONNECTORS = [
	'notion',
	'planetscale',
	'slack',
	'vercel',
] as const satisfies readonly OAuthConnector[];

export const ManagedConnectorSchema = Schema.Literals(MANAGED_CONNECTORS);
export const OAuthConnectorSchema = Schema.Literals(OAUTH_CONNECTORS);

/** Provider account kinds surfaced through installation APIs. */
export const ProviderAccountType = Schema.Literals([
	'user',
	'organization',
	'workspace',
	'enterprise',
]);
export type ProviderAccountType = typeof ProviderAccountType.Type;

/** Provider account metadata persisted with an installation. */
export class ProviderAccount extends Schema.Class<ProviderAccount>(
	'@hem/core/ProviderAccount'
)({
	id: Schema.String,
	name: Schema.String,
	type: ProviderAccountType,
}) {}

/** OAuth credential payload persisted for managed connectors. */
export const ProviderCredentials = Schema.Struct({
	accessToken: Schema.String,
	expiresAt: Schema.optional(Schema.NullOr(Schema.String)),
	refreshToken: Schema.optional(Schema.NullOr(Schema.String)),
	scope: Schema.optional(Schema.NullOr(Schema.String)),
	teamId: Schema.optional(Schema.NullOr(Schema.String)),
	tokenType: Schema.optional(Schema.NullOr(Schema.String)),
});
export type ProviderCredentials = typeof ProviderCredentials.Type;

export const CONNECTOR_LABELS = {
	github: 'GitHub',
	notion: 'Notion',
	planetscale: 'PlanetScale',
	slack: 'Slack',
	vercel: 'Vercel',
} as const satisfies Record<ManagedConnector, string>;

export const CONNECTOR_DEFAULT_OUTPUTS = {
	github: ['GITHUB_TOKEN'],
	notion: ['NOTION_TOKEN'],
	planetscale: ['PLANETSCALE_TOKEN'],
	slack: ['SLACK_BOT_TOKEN'],
	vercel: ['VERCEL_TOKEN'],
} as const satisfies Record<ManagedConnector, readonly [string, ...string[]]>;

export const CONNECTOR_POSSIBLE_OUTPUTS = {
	github: ['GITHUB_TOKEN'],
	notion: ['NOTION_TOKEN'],
	planetscale: ['PLANETSCALE_TOKEN'],
	slack: ['SLACK_BOT_TOKEN'],
	vercel: ['VERCEL_TOKEN', 'VERCEL_TEAM_ID'],
} as const satisfies Record<ManagedConnector, readonly [string, ...string[]]>;

/**
 * Returns whether the connector completes installation through OAuth.
 */
export const isOAuthConnector = (
	connector: ManagedConnector
): connector is OAuthConnector =>
	(OAUTH_CONNECTORS as readonly string[]).includes(connector);

/**
 * Parses unknown provider account JSON from a persistence seam.
 */
export const parseProviderAccount = (input: unknown) =>
	Schema.decodeUnknownEffect(ProviderAccount)(input);

/**
 * Parses unknown provider credential JSON from a persistence seam.
 */
export const parseProviderCredentials = (input: unknown) =>
	Schema.decodeUnknownEffect(ProviderCredentials)(input);