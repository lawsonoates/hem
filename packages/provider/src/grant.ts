import { Data, Effect } from 'effect';

/**
 * Provider-agnostic permission model. The CLI parses each `--permission` value
 * into a `Grant` and hands it to a provider, which maps it onto its own native
 * permission system. This layer fixes the *syntax* of a permission; providers
 * own its *meaning* (which services, access levels, and scopes actually exist).
 *
 * DSL grammar (one grant per `--permission`):
 *
 *   grant     := [ ("allow" | "deny") " " ] ( canonical | raw )
 *   canonical := <service> ":" <access> [ "@" <scope-type> [ "/" <id> ] ]
 *   raw       := "raw:" <provider-native-permission>
 *
 * Examples:
 *   r2:write                      R2 write across the whole account
 *   r2:read@bucket/uploads        scoped to a single R2 bucket
 *   dns:edit@zone/example.com     scoped to a single zone
 *   deny r2:write                 an explicit deny
 *   raw:Workers R2 Storage Write  a Cloudflare permission group, verbatim
 */

export type GrantEffect = 'allow' | 'deny';

/** What a grant applies to. `account` (the default) means the whole account. */
export interface Scope {
	readonly type: string;
	readonly id?: string;
}

/** A canonical, cross-provider capability: `<service>:<access>` at a `scope`. */
export interface CanonicalGrant {
	readonly kind: 'canonical';
	readonly effect: GrantEffect;
	readonly service: string;
	readonly access: string;
	readonly scope: Scope;
}

/** A provider-native permission identifier, passed through without translation. */
export interface RawGrant {
	readonly kind: 'raw';
	readonly effect: GrantEffect;
	readonly id: string;
}

export type Grant = CanonicalGrant | RawGrant;

/** Raised when a `--permission` value does not match the grant grammar. */
export class GrantParseError extends Data.TaggedError('GrantParseError')<{
	readonly input: string;
	readonly message: string;
}> {}

const CANONICAL =
	/^(?<service>[a-z0-9]+):(?<access>[a-z]+)(?:@(?<scopeType>[a-z0-9]+)(?:\/(?<id>.+))?)?$/u;

const splitEffect = (input: string): readonly [GrantEffect, string] => {
	if (input.startsWith('allow ')) return ['allow', input.slice(6).trim()];
	if (input.startsWith('deny ')) return ['deny', input.slice(5).trim()];
	return ['allow', input];
};

/** Parse a single `--permission` value into a provider-agnostic `Grant`. */
export const parseGrant = (
	input: string
): Effect.Effect<Grant, GrantParseError> => {
	const [effect, rest] = splitEffect(input.trim());

	if (rest.startsWith('raw:')) {
		const id = rest.slice(4).trim();
		return id.length > 0
			? Effect.succeed({ effect, id, kind: 'raw' })
			: Effect.fail(
					new GrantParseError({
						input,
						message:
							'A "raw:" permission must name a provider permission, for example "raw:Workers R2 Storage Write".',
					})
				);
	}

	const groups = CANONICAL.exec(rest)?.groups;
	if (!groups) {
		return Effect.fail(
			new GrantParseError({
				input,
				message: `Invalid permission "${input}". Expected "<service>:<access>[@<scope>]", for example "r2:write" or "dns:edit@zone/example.com".`,
			})
		);
	}

	const { access = '', id, scopeType, service = '' } = groups;
	return Effect.succeed({
		access,
		effect,
		kind: 'canonical',
		scope: { id, type: scopeType ?? 'account' },
		service,
	});
};
