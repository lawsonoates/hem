import { Schema } from 'effect';

const SlackWorkspace = Schema.Struct({
	id: Schema.String,
	name: Schema.String,
});

export class NotionTokenResponse extends Schema.Class<NotionTokenResponse>(
	'@hem/console-api/connectors/NotionTokenResponse'
)({
	access_token: Schema.String,
	refresh_token: Schema.optional(Schema.String),
	scope: Schema.optional(Schema.String),
	token_type: Schema.optional(Schema.String),
	workspace_id: Schema.String,
	workspace_name: Schema.optional(Schema.String),
}) {}

export class SlackOAuthResponse extends Schema.Class<SlackOAuthResponse>(
	'@hem/console-api/connectors/SlackOAuthResponse'
)({
	access_token: Schema.String,
	app_id: Schema.optional(Schema.String),
	enterprise: Schema.optional(SlackWorkspace),
	ok: Schema.Literal(true),
	scope: Schema.optional(Schema.String),
	team: Schema.optional(SlackWorkspace),
	token_type: Schema.optional(Schema.String),
}) {}

export class PlanetScaleTokenResponse extends Schema.Class<PlanetScaleTokenResponse>(
	'@hem/console-api/connectors/PlanetScaleTokenResponse'
)({
	access_token: Schema.String,
	expires_in: Schema.optional(Schema.Number),
	refresh_token: Schema.optional(Schema.String),
	scope: Schema.optional(Schema.String),
	token_type: Schema.optional(Schema.String),
}) {}

export class PlanetScaleTokenInfoResponse extends Schema.Class<PlanetScaleTokenInfoResponse>(
	'@hem/console-api/connectors/PlanetScaleTokenInfoResponse'
)({
	active: Schema.Literal(true),
	exp: Schema.optional(Schema.Number),
	scope: Schema.optional(Schema.String),
	sub: Schema.optional(Schema.String),
}) {}

export class VercelTokenResponse extends Schema.Class<VercelTokenResponse>(
	'@hem/console-api/connectors/VercelTokenResponse'
)({
	access_token: Schema.String,
	scope: Schema.optional(Schema.String),
	team_id: Schema.optional(Schema.String),
	token_type: Schema.optional(Schema.String),
	user_id: Schema.optional(Schema.String),
}) {}
