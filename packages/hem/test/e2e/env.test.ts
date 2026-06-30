import { expect, test } from 'bun:test';

import { makeHemCli } from './cli-process';
import { createHemFixture } from './fixtures';

test('adds a manual env var and injects it into a child command', async () => {
	const fixture = await createHemFixture();
	try {
		const hem = makeHemCli(fixture);

		const empty = await hem.run(['env', 'list']);
		hem.expectExit(empty, 0, 'hem env list');
		expect(empty.stdout).toContain('No env vars added.');

		const added = await hem.run(['env', 'add', 'FOO'], {
			stdin: 'super-secret\n',
		});
		hem.expectExit(added, 0, 'hem env add FOO');
		expect(added.stdout).toContain('Added FOO');

		const manifest = await fixture.readProjectJson<{
			readonly secrets: ReadonlyArray<{
				readonly vars: ReadonlyArray<{ readonly label: string }>;
			}>;
		}>('.hem/secrets.json');
		expect(manifest.secrets[0]?.vars[0]?.label).toBe('FOO');
		expect(JSON.stringify(manifest)).not.toContain('super-secret');

		const secretStore = await Bun.file(fixture.secretStorePath).json();
		expect(JSON.stringify(secretStore)).toContain('super-secret');

		await fixture.writeProjectFile(
			'print-env.ts',
			'console.log(process.env.FOO ?? "missing");\n'
		);

		const injected = await hem.run(['--', 'bun', 'print-env.ts']);
		hem.expectExit(injected, 0, 'hem -- bun print-env.ts');
		expect(injected.stdout.trim()).toBe('super-secret');
	} finally {
		await fixture.cleanup();
	}
}, 30_000);
