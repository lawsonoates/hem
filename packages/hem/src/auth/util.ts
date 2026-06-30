import { Config, Console, Effect } from 'effect';
import open from 'open';

export const openBrowser = (url: string) =>
	Effect.gen(function* () {
		const noBrowser = yield* Config.string('HEM_TEST_NO_BROWSER').pipe(
			Config.withDefault('0')
		);

		if (noBrowser === '1' || noBrowser === 'true') {
			yield* Console.log(
				`Open this URL in your browser to authorize Hem:\n${url}`
			);
			return;
		}

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
