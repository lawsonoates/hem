#!/usr/bin/env bun

const tunnelName = 'hem-dev';
const publicUrl = 'https://hem.lawsonoates.com';
const privateKeyPath =
	process.env.GITHUB_APP_PRIVATE_KEY_PATH ??
	'/Users/lawsonoates/Downloads/hemdevtemp.2026-06-19.private-key.pem';
const packageRoot = decodeURIComponent(
	new URL('../', import.meta.url).pathname
);

// ---- guard ----
if (process.env.NODE_ENV !== 'development') {
	console.error('This command can only run with NODE_ENV=development.');
	process.exit(1);
}

if (!Bun.which('cloudflared')) {
	console.error(
		'cloudflared is required. Install it with `brew install cloudflared`.'
	);
	process.exit(1);
}

const privateKeyFile = Bun.file(privateKeyPath);
if (!process.env.GITHUB_APP_PRIVATE_KEY && !(await privateKeyFile.exists())) {
	console.error(
		`GitHub App private key not found at ${privateKeyPath}. Set GITHUB_APP_PRIVATE_KEY or GITHUB_APP_PRIVATE_KEY_PATH.`
	);
	process.exit(1);
}

if (!process.env.HEM_DATABASE_URL) {
	console.error(
		'HEM_DATABASE_URL is required for the Postgres API database.'
	);
	process.exit(1);
}

const tunnelList = Bun.spawnSync(
	['cloudflared', 'tunnel', 'list', '--name', tunnelName, '--output', 'json'],
	{
		stderr: 'ignore',
	}
);
const tunnelExists =
	tunnelList.exitCode === 0 &&
	new TextDecoder().decode(tunnelList.stdout).includes(tunnelName);
if (!tunnelExists) {
	console.error(
		`Cloudflare tunnel "${tunnelName}" was not found. Create it before running this command.`
	);
	process.exit(1);
}

// ---- start ----
const environment = {
	...process.env,
	BETTER_AUTH_SECRET:
		process.env.BETTER_AUTH_SECRET ??
		`${crypto.randomUUID()}${crypto.randomUUID()}`,
	GITHUB_APP_ID: process.env.GITHUB_APP_ID ?? '4094539',
	GITHUB_APP_PRIVATE_KEY:
		process.env.GITHUB_APP_PRIVATE_KEY ?? (await privateKeyFile.text()),
	GITHUB_APP_SLUG: process.env.GITHUB_APP_SLUG ?? 'hemdevtemp',
	HEM_API_URL: publicUrl,
	HEM_DATABASE_URL: process.env.HEM_DATABASE_URL,
	NODE_ENV: 'development',
	PORT: '3000',
};

const server = Bun.spawn(['bun', '--watch', 'src/server.ts'], {
	cwd: packageRoot,
	env: environment,
	stderr: 'inherit',
	stdin: 'inherit',
	stdout: 'inherit',
});

const tunnel = Bun.spawn(
	[
		'cloudflared',
		'tunnel',
		'--url',
		'http://localhost:3000',
		'run',
		tunnelName,
	],
	{
		cwd: packageRoot,
		stderr: 'inherit',
		stdin: 'inherit',
		stdout: 'inherit',
	}
);

// ---- supervise ----
let stopping = false;

async function stop(code: number) {
	if (stopping) return;
	stopping = true;

	if (server.exitCode === null) server.kill('SIGTERM');
	if (tunnel.exitCode === null) tunnel.kill('SIGTERM');

	await Promise.allSettled([server.exited, tunnel.exited]);
	process.exit(code);
}

process.on('SIGINT', () => void stop(0));
process.on('SIGTERM', () => void stop(0));

const exitCode = await Promise.race([server.exited, tunnel.exited]);
await stop(exitCode === 0 ? 1 : exitCode);
