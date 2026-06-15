import { Console, Data, Effect } from 'effect';

/**
 * A user-facing CLI error. Carries a human-readable message that is printed
 * (without a stack trace) at the top level, mirroring the old
 * `console.error(message); process.exit(1)` pattern.
 *
 * Tagged `HemError` rather than `UserError` to avoid colliding with
 * `effect/unstable/cli`'s own `CliError.UserError`, which shares that tag.
 */
export class HemError extends Data.TaggedError('HemError')<{
	readonly message: string;
	readonly exitCode?: number;
}> {}

export const exitWithMessage = (message: string, exitCode = 1) =>
	Console.error(message).pipe(
		Effect.andThen(
			Effect.sync(() => {
				process.exitCode = exitCode;
			})
		)
	);
