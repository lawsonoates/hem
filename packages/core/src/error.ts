import { Data } from 'effect';

/**
 * A user-facing CLI error. Carries a human-readable message that is printed
 * (without a stack trace) at the top level.
 *
 * Tagged `HemError` rather than `UserError` to avoid colliding with
 * `effect/unstable/cli`'s own `CliError.UserError`, which shares that tag.
 */
export class HemError extends Data.TaggedError('HemError')<{
	readonly message: string;
	readonly exitCode?: number;
}> {}

/** Raised when `.hem/secrets.json` exists but does not match the schema. */
export class InvalidSecretsManifest extends Data.TaggedError(
	'InvalidSecretsManifest'
)<{ readonly path: string }> {
	override get message() {
		return `Invalid secrets manifest at ${this.path}`;
	}
}