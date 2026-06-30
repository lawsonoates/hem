import { expect, test } from 'bun:test';

import { makeHemCli } from './cli-process';
import { createHemFixture } from './fixtures';

test('fails clearly when no external command is provided', async () => {
	const fixture = await createHemFixture();
	try {
		const hem = makeHemCli(fixture);

		// Bun consumes the first `--`; the second one is what reaches Hem as
		// the external-command separator with no command after it.
		const result = await hem.run(['--', '--']);
		hem.expectExit(result, 1, 'hem -- --');
		expect(result.stderr).toContain(
			'No command provided. Usage: hem <command> [...args]'
		);
	} finally {
		await fixture.cleanup();
	}
}, 30_000);

test('propagates the child command exit code', async () => {
	const fixture = await createHemFixture();
	try {
		const hem = makeHemCli(fixture);

		const result = await hem.run(['bun', '-e', 'process.exit(7)']);
		hem.expectExit(result, 7, 'hem bun -e process.exit(7)');
	} finally {
		await fixture.cleanup();
	}
}, 30_000);

test('fails clearly when a manifest secret is missing from the keychain', async () => {
	const fixture = await createHemFixture();
	try {
		const hem = makeHemCli(fixture);
		await fixture.writeProjectJson('.hem/secrets.json', {
			secrets: [
				{
					vars: [
						{
							id: 'var_missing',
							label: 'MISSING_SECRET',
							source: {
								name: 'manual:MISSING_SECRET',
								service: 'hem.env',
								type: 'keychain',
							},
						},
					],
				},
			],
			version: 1,
		});

		const result = await hem.run(['bun', '-e', 'process.exit(0)']);
		hem.expectExit(result, 1, 'hem missing keychain secret');
		expect(result.stderr).toContain(
			'No value for "MISSING_SECRET" in the system keychain.'
		);
	} finally {
		await fixture.cleanup();
	}
}, 30_000);

test('fails clearly when the secrets manifest is invalid', async () => {
	const fixture = await createHemFixture();
	try {
		const hem = makeHemCli(fixture);
		await fixture.writeProjectFile('.hem/secrets.json', '{ not json');

		const result = await hem.run(['bun', '-e', 'process.exit(0)']);
		hem.expectExit(result, 1, 'hem invalid manifest');
		expect(result.stderr).toContain('Invalid secrets manifest at');
		expect(result.stderr).toContain('.hem/secrets.json');
	} finally {
		await fixture.cleanup();
	}
}, 30_000);
