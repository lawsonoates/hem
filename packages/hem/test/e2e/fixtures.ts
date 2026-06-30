import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));

export const hemEntry = path.join(repoRoot, 'packages/hem/src/index.ts');

const writeJson = async (file: string, value: unknown) => {
	await mkdir(path.dirname(file), { recursive: true });
	await Bun.write(file, `${JSON.stringify(value, null, 2)}\n`);
};

export interface HemE2eFixture {
	readonly rootDir: string;
	readonly projectDir: string;
	readonly homeDir: string;
	readonly secretStorePath: string;
	readonly env: Record<string, string>;
	readonly cleanup: () => Promise<void>;
	readonly readProjectJson: <T = unknown>(file: string) => Promise<T>;
	readonly writeProjectFile: (file: string, content: string) => Promise<void>;
	readonly writeSession: (
		baseUrl: string,
		session?: { readonly accessToken?: string; readonly expiresAt?: string }
	) => Promise<void>;
}

export const createHemFixture = async (): Promise<HemE2eFixture> => {
	const rootDir = await mkdtemp(path.join(tmpdir(), 'hem-e2e-'));
	const projectDir = path.join(rootDir, 'project');
	const homeDir = path.join(rootDir, 'home');
	const secretStorePath = path.join(rootDir, 'secrets.json');

	await mkdir(projectDir, { recursive: true });
	await mkdir(homeDir, { recursive: true });

	const env = {
		HEM_TEST_HOME: homeDir,
		HEM_TEST_NO_BROWSER: '1',
		HEM_TEST_SECRET_STORE: secretStorePath,
		NO_COLOR: '1',
	} satisfies Record<string, string>;

	return {
		cleanup: () => rm(rootDir, { force: true, recursive: true }),
		env,
		homeDir,
		projectDir,
		readProjectJson: <T = unknown>(file: string) =>
			Bun.file(path.join(projectDir, file)).json() as Promise<T>,
		rootDir,
		secretStorePath,
		writeProjectFile: async (file: string, content: string) => {
			const destination = path.join(projectDir, file);
			await mkdir(path.dirname(destination), { recursive: true });
			await Bun.write(destination, content);
		},
		writeSession: (baseUrl, session) =>
			writeJson(path.join(homeDir, '.local/share/hem/auth.json'), {
				[new URL(baseUrl).origin]: {
					accessToken: session?.accessToken ?? 'hem-e2e-token',
					expiresAt:
						session?.expiresAt ??
						new Date(Date.now() + 3_600_000).toISOString(),
				},
			}),
	};
};
