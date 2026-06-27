import { Effect, Schema } from 'effect';

type Fn<A, R, E, Req> = {
	(input: unknown): Effect.Effect<R, E | Schema.SchemaError, Req>;
	force: (input: A) => Effect.Effect<R, E, Req>;
	schema: Schema.Schema<A>;
};

export const fn = <A, R, E, Req>(
	schema: Schema.Schema<A>,
	handler: (input: A) => Effect.Effect<R, E, Req>
): Fn<A, R, E, Req> => {
	const run = ((input: unknown) =>
		Schema.decodeUnknownEffect(schema)(input).pipe(
			Effect.flatMap(handler)
		)) as Fn<A, R, E, Req>;

	run.force = handler;
	run.schema = schema;
	return run;
};