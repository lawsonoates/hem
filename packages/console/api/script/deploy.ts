const remote = 'root@170.64.232.211';
const remoteRoot = '/opt/hem';
const legacyRoot = '/root/lighthouse-checker';
const bun = '/root/.bun/bin/bun';
const pm2 = `${bun} /root/.bun/install/global/node_modules/pm2/bin/pm2`;
const publicUrl = process.env.HEM_API_URL ?? 'http://170.64.232.211';

const repositoryRoot = decodeURIComponent(
	new URL('../../../../', import.meta.url).pathname
);

const privateKeyPath = process.env.GITHUB_APP_PRIVATE_KEY_PATH;
const githubPrivateKey =
	process.env.GITHUB_APP_PRIVATE_KEY ??
	(privateKeyPath ? await Bun.file(privateKeyPath).text() : undefined);

const missingEnvironment = [
	!process.env.GITHUB_APP_ID && 'GITHUB_APP_ID',
	!githubPrivateKey &&
		'GITHUB_APP_PRIVATE_KEY or GITHUB_APP_PRIVATE_KEY_PATH',
	!process.env.GITHUB_APP_SLUG && 'GITHUB_APP_SLUG',
	!process.env.HEM_DATABASE_URL && 'HEM_DATABASE_URL',
].filter(Boolean);

if (missingEnvironment.length > 0) {
	throw new Error(
		`Missing deployment environment: ${missingEnvironment.join(', ')}`
	);
}

const deploymentEnvironment = {
	BETTER_AUTH_SECRET:
		process.env.BETTER_AUTH_SECRET ??
		`${crypto.randomUUID()}${crypto.randomUUID()}`,
	GITHUB_API_URL: process.env.GITHUB_API_URL ?? 'https://api.github.com',
	GITHUB_APP_ID: process.env.GITHUB_APP_ID as string,
	GITHUB_APP_PRIVATE_KEY: githubPrivateKey as string,
	GITHUB_APP_SLUG: process.env.GITHUB_APP_SLUG as string,
	HEM_API_URL: publicUrl,
	HEM_DATABASE_URL: process.env.HEM_DATABASE_URL as string,
	HOST: '0.0.0.0',
	NODE_ENV: 'production',
	PORT: '80',
};

const dotenv = `${Object.entries(deploymentEnvironment)
	.map(([name, value]) => `${name}=${JSON.stringify(value)}`)
	.join('\n')}\n`;

const temporaryEnvironment = `/tmp/hem-deploy-${crypto.randomUUID()}.env`;

const ssh = (command: string) => Bun.$`ssh ${remote} ${command}`;

const pm2Command = (arguments_: string) => ssh(`${pm2} ${arguments_}`);

const waitForHealth = (port: number, processName: string) =>
	ssh(
		`for attempt in {1..20}; do if curl --fail --silent http://127.0.0.1:${port}/device >/dev/null; then exit 0; fi; sleep 1; done; ${pm2} logs ${processName} --lines 100 --nostream; exit 1`
	);

let legacyWasRunning = false;
let legacyStopped = false;

try {
	await Bun.write(temporaryEnvironment, dotenv);

	console.log('Preparing droplet…');
	await ssh(`mkdir -p ${remoteRoot}/data`);

	console.log('Copying Hem…');
	await Bun.$`rsync --archive --compress --delete --exclude=.git/ --exclude=.turbo/ --exclude=node_modules/ --exclude=dist/ --exclude=data/ --exclude=.env --exclude='.env.*' --exclude='*.db' --exclude='*.key' --exclude='*.pem' --exclude='*.tsbuildinfo' --exclude=.DS_Store ${repositoryRoot} ${remote}:${remoteRoot}/`;
	await Bun.$`rsync --archive --chmod=F600 ${temporaryEnvironment} ${remote}:${remoteRoot}/.env`;

	console.log('Installing dependencies…');
	await ssh(`cd ${remoteRoot} && ${bun} install --frozen-lockfile`);

	console.log('Starting a canary on port 3000…');
	await pm2Command('delete hem-api-canary >/dev/null 2>&1 || true');
	await ssh(
		`cd ${remoteRoot} && PORT=3000 ${pm2} start packages/console/api/src/server.ts --name hem-api-canary --interpreter ${bun} --cwd ${remoteRoot} --time`
	);
	await waitForHealth(3000, 'hem-api-canary');
	await pm2Command('delete hem-api-canary');

	const legacyStatus = await ssh(
		`docker ps --filter name=lighthouse-checker --format '{{.Names}}'`
	).quiet();
	legacyWasRunning = legacyStatus.text().trim().length > 0;

	if (legacyWasRunning) {
		console.log('Stopping the existing lighthouse-checker Compose stack…');
		await ssh(`cd ${legacyRoot} && docker compose down`);
		legacyStopped = true;
	}

	console.log('Starting Hem on port 80…');
	await pm2Command('delete hem-api >/dev/null 2>&1 || true');
	await ssh(
		`cd ${remoteRoot} && ${pm2} start packages/console/api/src/server.ts --name hem-api --interpreter ${bun} --cwd ${remoteRoot} --time`
	);
	await waitForHealth(80, 'hem-api');
	await pm2Command('save');

	const response = await fetch(new URL('/device', publicUrl));
	if (!response.ok) {
		throw new Error(
			`Public health check returned HTTP ${response.status}.`
		);
	}

	console.log(`Deployed Hem to ${publicUrl}`);
} catch (error) {
	await pm2Command('delete hem-api-canary >/dev/null 2>&1 || true').nothrow();

	if (legacyStopped) {
		console.error('Deployment failed; restoring lighthouse-checker…');
		await pm2Command('delete hem-api >/dev/null 2>&1 || true').nothrow();
		await ssh(`cd ${legacyRoot} && docker compose up -d`).nothrow();
	}

	throw error;
} finally {
	await Bun.file(temporaryEnvironment).delete();
}
