import { expect, test } from 'bun:test';
import path from 'node:path';

import { makeHemCli } from './cli-process';
import { startFakeControlPlane } from './fake-control-plane';
import { createHemFixture } from './fixtures';

const authFile = (homeDir: string) =>
	path.join(homeDir, '.local/share/hem/auth.json');

test('login stores a session for the configured control plane', async () => {
	const fixture = await createHemFixture();
	const controlPlane = startFakeControlPlane();

	try {
		const hem = makeHemCli(fixture);
		const env = { HEM_API_URL: controlPlane.url };

		const loggedIn = await hem.run(['login'], { env });
		hem.expectExit(loggedIn, 0, 'hem login');
		expect(loggedIn.stdout).toContain('Opening Hem to sign in');
		expect(loggedIn.stdout).toContain('Device code: HEM-E2E');
		expect(loggedIn.stdout).toContain('Signed in to Hem');

		const sessions = await Bun.file(authFile(fixture.homeDir)).json();
		expect(sessions[controlPlane.url]).toMatchObject({
			accessToken: 'hem-e2e-token',
		});
		expect(
			Date.parse(sessions[controlPlane.url].expiresAt)
		).toBeGreaterThan(Date.now());
		expect(controlPlane.requests).toContain('POST /v1/auth/device/code');
		expect(controlPlane.requests).toContain('POST /v1/auth/device/token');
	} finally {
		controlPlane.stop();
		await fixture.cleanup();
	}
}, 30_000);

test('logout clears a saved session and signs out remotely', async () => {
	const fixture = await createHemFixture();
	const controlPlane = startFakeControlPlane();

	try {
		await fixture.writeSession(controlPlane.url, {
			accessToken: 'token-to-sign-out',
		});
		const hem = makeHemCli(fixture);
		const env = { HEM_API_URL: controlPlane.url };

		const loggedOut = await hem.run(['logout'], { env });
		hem.expectExit(loggedOut, 0, 'hem logout');
		expect(loggedOut.stdout).toContain('You are now logged out');
		expect(loggedOut.stdout).toContain('Run hem login to log in again');
		expect(await Bun.file(authFile(fixture.homeDir)).exists()).toBe(false);
		expect(controlPlane.requests).toContain('POST /v1/auth/sign-out');
	} finally {
		controlPlane.stop();
		await fixture.cleanup();
	}
}, 30_000);
