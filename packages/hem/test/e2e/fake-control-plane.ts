import {
	CONNECTOR_DEFAULT_OUTPUTS,
	MANAGED_CONNECTORS,
	type ManagedConnector,
} from '@hem/core/connector';

interface InstallationRecord {
	readonly connector: ManagedConnector;
	readonly id: string;
	readonly providerInstallationId: string;
}

interface BindingRecord {
	readonly connector: ManagedConnector;
	readonly id: string;
	readonly installationId: string;
	readonly outputs: readonly string[];
}

export interface FakeControlPlaneOptions {
	readonly credentialValues?: Partial<
		Record<ManagedConnector, Record<string, string>>
	>;
}

export interface FakeControlPlane {
	readonly url: string;
	readonly requests: readonly string[];
	readonly stop: () => void;
}

const isManagedConnector = (value: string): value is ManagedConnector =>
	(MANAGED_CONNECTORS as readonly string[]).includes(value);

const json = (body: unknown, status = 200) =>
	Response.json(body, {
		headers: { 'cache-control': 'no-store' },
		status,
	});

const defaultValues = (connector: ManagedConnector) => {
	const outputs = CONNECTOR_DEFAULT_OUTPUTS[connector];
	return Object.fromEntries(
		outputs.map((output) => [output, `fake-${output.toLowerCase()}`])
	);
};

export const startFakeControlPlane = (
	options: FakeControlPlaneOptions = {}
): FakeControlPlane => {
	const requests: string[] = [];
	const installations = new Map<string, InstallationRecord>();
	const bindings = new Map<string, BindingRecord>();
	let baseUrl = '';
	let nextInstallation = 1;
	let nextBinding = 1;

	const server = Bun.serve({
		fetch: async (request) => {
			const url = new URL(request.url);
			requests.push(`${request.method} ${url.pathname}`);

			if (
				request.method === 'POST' &&
				url.pathname === '/v1/auth/device/code'
			) {
				return json({
					device_code: 'hem-e2e-device',
					expires_in: 60,
					interval: 0,
					user_code: 'HEM-E2E',
					verification_uri: `${baseUrl}/device`,
					verification_uri_complete: `${baseUrl}/device?user_code=HEM-E2E`,
				});
			}

			if (
				request.method === 'POST' &&
				url.pathname === '/v1/auth/device/token'
			) {
				return json({
					access_token: 'hem-e2e-token',
					expires_in: 3600,
					scope: 'cli',
					token_type: 'Bearer',
				});
			}

			if (
				request.method === 'POST' &&
				url.pathname === '/v1/auth/sign-out'
			) {
				return json({});
			}

			const startMatch =
				/^\/v1\/connectors\/([^/]+)\/installations$/u.exec(
					url.pathname
				);
			if (request.method === 'POST' && startMatch) {
				const connector = startMatch[1] ?? '';
				if (!isManagedConnector(connector)) {
					return json({ message: 'Unknown connector.' }, 404);
				}

				const requestId = `req_${nextInstallation}`;
				const installationId = `ins_${nextInstallation}`;
				installations.set(requestId, {
					connector,
					id: installationId,
					providerInstallationId: `provider_${nextInstallation}`,
				});
				nextInstallation += 1;

				return json({
					authorizationUrl: `${baseUrl}/authorize/${connector}?request_id=${requestId}`,
					expiresAt: new Date(Date.now() + 60_000).toISOString(),
					requestId,
				});
			}

			const statusMatch =
				/^\/v1\/connectors\/([^/]+)\/installations\/status$/u.exec(
					url.pathname
				);
			if (request.method === 'GET' && statusMatch) {
				const connector = statusMatch[1] ?? '';
				const requestId = url.searchParams.get('request_id') ?? '';
				const installation = installations.get(requestId);
				if (!isManagedConnector(connector) || !installation) {
					return json({ message: 'Installation not found.' }, 404);
				}

				return json({
					account: {
						id: `${connector}_account`,
						name: `E2E ${connector}`,
						type:
							connector === 'github'
								? 'organization'
								: 'workspace',
					},
					connector,
					id: installation.id,
					providerInstallationId: installation.providerInstallationId,
				});
			}

			if (request.method === 'POST' && url.pathname === '/v1/bindings') {
				const body = (await request.json()) as {
					installationId?: string;
				};
				const installation = [...installations.values()].find(
					(candidate) => candidate.id === body.installationId
				);
				if (!installation) {
					return json({ message: 'Installation not found.' }, 404);
				}

				const id = `bind_${nextBinding}`;
				const outputs =
					CONNECTOR_DEFAULT_OUTPUTS[installation.connector];
				nextBinding += 1;
				bindings.set(id, {
					connector: installation.connector,
					id,
					installationId: installation.id,
					outputs,
				});

				return json({
					connector: installation.connector,
					id,
					installationId: installation.id,
					outputs,
				});
			}

			if (
				request.method === 'POST' &&
				url.pathname === '/v1/credential-leases'
			) {
				const body = (await request.json()) as { bindingId?: string };
				const binding = bindings.get(body.bindingId ?? '');
				if (!binding) {
					return json({ message: 'Binding not found.' }, 404);
				}

				return json({
					expiresAt: new Date(Date.now() + 60_000).toISOString(),
					values:
						options.credentialValues?.[binding.connector] ??
						defaultValues(binding.connector),
				});
			}

			return json({ message: 'Not found.' }, 404);
		},
		hostname: '127.0.0.1',
		port: 0,
	});

	baseUrl = `http://127.0.0.1:${server.port}`;

	return {
		requests,
		stop: () => server.stop(true),
		url: baseUrl,
	};
};
