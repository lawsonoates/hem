import { Schema } from 'effect';

export const ManagedConnector = Schema.Literals([
	'github',
	'notion',
	'planetscale',
	'slack',
	'vercel',
]);
export type ManagedConnector = typeof ManagedConnector.Type;

export const OAuthConnector = Schema.Literals([
	'notion',
	'planetscale',
	'slack',
	'vercel',
]);
export type OAuthConnector = typeof OAuthConnector.Type;

export const MANAGED_CONNECTORS = [
	'github',
	'notion',
	'planetscale',
	'slack',
	'vercel',
] as const satisfies readonly ManagedConnector[];

export const OAUTH_CONNECTORS = [
	'notion',
	'planetscale',
	'slack',
	'vercel',
] as const satisfies readonly OAuthConnector[];

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

export const isOAuthConnector = (
	connector: ManagedConnector
): connector is OAuthConnector =>
	connector === 'notion' ||
	connector === 'planetscale' ||
	connector === 'slack' ||
	connector === 'vercel';
