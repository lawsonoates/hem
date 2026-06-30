import { expect, test } from 'bun:test';

import { makeHemCli } from './cli-process';
import { startFakeControlPlane } from './fake-control-plane';
import { createHemFixture } from './fixtures';

test('connects a managed provider and injects leased credentials', async () => {
	const fixture = await createHemFixture();
	const controlPlane = startFakeControlPlane({
		credentialValues: {
			github: { GITHUB_TOKEN: 'ghs_e2e_token' },
		},
	});

	try {
		await fixture.writeSession(controlPlane.url);
		const hem = makeHemCli(fixture);
		const env = { HEM_API_URL: controlPlane.url };

		const connected = await hem.run(['connect', 'github'], { env });
		hem.expectExit(connected, 0, 'hem connect github');
		expect(connected.stdout).toContain(
			'Connected GitHub account E2E github'
		);

		const manifest = await fixture.readProjectJson<{
			readonly bindings?: ReadonlyArray<{
				readonly bindingId: string;
				readonly connector: string;
				readonly outputs: readonly string[];
			}>;
		}>('.hem/secrets.json');
		expect(manifest.bindings?.[0]).toEqual({
			bindingId: 'bind_1',
			connector: 'github',
			outputs: ['GITHUB_TOKEN'],
		});

		await fixture.writeProjectFile(
			'print-env.ts',
			'console.log(process.env.GITHUB_TOKEN ?? "missing");\n'
		);

		const injected = await hem.run(['--', 'bun', 'print-env.ts'], {
			env,
		});
		hem.expectExit(injected, 0, 'hem -- bun print-env.ts');
		expect(injected.stdout.trim()).toBe('ghs_e2e_token');
		expect(controlPlane.requests).toContain('POST /v1/credential-leases');
	} finally {
		controlPlane.stop();
		await fixture.cleanup();
	}
}, 30_000);
