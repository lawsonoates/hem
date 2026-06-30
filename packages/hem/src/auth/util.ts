import { Console, Effect } from 'effect';
import open from 'open';

export const openBrowser = (url: string) =>
	Effect.gen(function* () {
		const opened = yield* Effect.tryPromise({
			catch: () => false,
			try: () => open(url),
		});

		if (!opened) {
			yield* Console.log(
				`Open this URL in your browser to authorize Hem:\n${url}`
			);
		}
	});
