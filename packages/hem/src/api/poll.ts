import { HemError } from '@hem/core/error';
import { Effect, Option } from 'effect';

export const pollUntilComplete = <A, E, R>(input: {
	readonly attempt: Effect.Effect<Option.Option<A>, E, R>;
	readonly expiresAt: string;
	readonly interval?: number;
	readonly timeoutMessage: string;
}) =>
	Effect.gen(function* () {
		const deadline = Date.parse(input.expiresAt);
		while (Date.now() < deadline) {
			const result = yield* input.attempt;
			if (Option.isSome(result)) return result.value;
			yield* Effect.sleep(`${input.interval ?? 1} seconds`);
		}
		return yield* new HemError({ message: input.timeoutMessage });
	});
