import { expect, test } from 'bun:test';

import { makeHemCli } from './cli-process';
import { createHemFixture } from './fixtures';

interface ManifestSnapshot {
	readonly bindings?: ReadonlyArray<{
		readonly bindingId: string;
		readonly connector: string;
		readonly outputs: readonly string[];
	}>;
	readonly secrets: ReadonlyArray<{
		readonly vars: ReadonlyArray<{ readonly label: string }>;
	}>;
}

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

		const injected = await hem.run(['bun', 'print-env.ts']);
		hem.expectExit(injected, 0, 'hem bun print-env.ts');
		expect(injected.stdout.trim()).toBe('super-secret');
	} finally {
		await fixture.cleanup();
	}
}, 30_000);

test('removes a manual env var and deletes its stored secret', async () => {
	const fixture = await createHemFixture();
	try {
		const hem = makeHemCli(fixture);
		const added = await hem.run(['env', 'add', 'REMOVE_ME'], {
			stdin: 'temporary-secret\n',
		});
		hem.expectExit(added, 0, 'hem env add REMOVE_ME');

		const removed = await hem.run(['env', 'rm', 'REMOVE_ME']);
		hem.expectExit(removed, 0, 'hem env rm REMOVE_ME');
		expect(removed.stdout).toContain('Removed 1 variable: REMOVE_ME');

		const manifest =
			await fixture.readProjectJson<ManifestSnapshot>(
				'.hem/secrets.json'
			);
		expect(manifest.secrets).toEqual([]);

		const secretStore = await Bun.file(fixture.secretStorePath).json();
		expect(JSON.stringify(secretStore)).not.toContain('temporary-secret');
		expect(JSON.stringify(secretStore)).not.toContain('manual:REMOVE_ME');
	} finally {
		await fixture.cleanup();
	}
}, 30_000);

test('removes a managed binding by one of its output names', async () => {
	const fixture = await createHemFixture();
	try {
		const hem = makeHemCli(fixture);
		await fixture.writeProjectJson('.hem/secrets.json', {
			bindings: [
				{
					bindingId: 'bind_123',
					connector: 'github',
					outputs: ['GITHUB_TOKEN'],
				},
			],
			secrets: [],
			version: 1,
		});

		const removed = await hem.run(['env', 'rm', 'GITHUB_TOKEN']);
		hem.expectExit(removed, 0, 'hem env rm GITHUB_TOKEN');
		expect(removed.stdout).toContain('Removed 1 variable: GITHUB_TOKEN');

		const manifest =
			await fixture.readProjectJson<ManifestSnapshot>(
				'.hem/secrets.json'
			);
		expect(manifest.bindings).toEqual([]);
		expect(manifest.secrets).toEqual([]);
	} finally {
		await fixture.cleanup();
	}
}, 30_000);

test('reports a missing env var without failing', async () => {
	const fixture = await createHemFixture();
	try {
		const hem = makeHemCli(fixture);

		const removed = await hem.run(['env', 'rm', 'MISSING']);
		hem.expectExit(removed, 0, 'hem env rm MISSING');
		expect(removed.stdout).toContain('No env var named MISSING was found.');
	} finally {
		await fixture.cleanup();
	}
}, 30_000);
