import type { z } from 'zod';

export const fn = <Schema extends z.ZodType, Result>(
	schema: Schema,
	handler: (input: z.infer<Schema>) => Result
) => {
	const result = (input: z.infer<Schema>) => handler(schema.parse(input));
	result.force = handler;
	result.schema = schema;
	return result;
};
