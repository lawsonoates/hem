import { Data, Effect } from 'effect';

/**
 * Provider-agnostic permission model. The CLI parses each `--permission` value
 * into a `Grant` and hands it to a provider, which maps it onto its own native
 * permission system.
 *
 * DSL grammar (one grant per `--permission`):
 *
 *   grant := <service> ":" <access> [ "@" <scope-type> [ "/" <id> ] ]
 *
 * Examples:
 *   r2:write                      R2 write across the whole account
 *   r2:read@bucket/uploads        scoped to a single R2 bucket
 *   dns:edit@zone/example.com     scoped to a single zone
 */

/** What a grant applies to. `account` (the default) means the whole account. */
export interface Scope {
	readonly type: string;
	readonly id?: string;
}

/** A canonical capability: `<service>:<access>` at a `scope`. */
export interface Grant {
	readonly access: string;
	readonly scope: Scope;
	readonly service: string;
}

/** Raised when a `--permission` value does not match the grant grammar. */
export class GrantParseError extends Data.TaggedError('GrantParseError')<{
	readonly input: string;
	readonly message: string;
}> {}

const CANONICAL =
	/^(?<service>[a-z0-9]+):(?<access>[a-z]+)(?:@(?<scopeType>[a-z0-9]+)(?:\/(?<id>.+))?)?$/u;

/** Parse a single `--permission` value into a provider-agnostic `Grant`. */
export const parseGrant = (
	input: string
): Effect.Effect<Grant, GrantParseError> => {
	const trimmed = input.trim();

	if (trimmed.startsWith('deny ')) {
		return Effect.fail(
			new GrantParseError({
				input,
				message:
					'Deny permissions are not supported. Pass only allow grants like "r2:write".',
			})
		);
	}

	if (trimmed.startsWith('raw:')) {
		return Effect.fail(
			new GrantParseError({
				input,
				message:
					'Raw permissions are not supported. Use a mapped grant like "r2:write".',
			})
		);
	}

	const rest = trimmed.startsWith('allow ')
		? trimmed.slice(6).trim()
		: trimmed;

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
		scope: { id, type: scopeType ?? 'account' },
		service,
	});
};
