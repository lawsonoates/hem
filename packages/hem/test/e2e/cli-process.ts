import type { HemE2eFixture } from './fixtures';
import { hemEntry } from './fixtures';

export interface RunHemOptions {
	readonly cwd?: string;
	readonly env?: Record<string, string | undefined>;
	readonly stdin?: string;
	readonly timeoutMs?: number;
}

export interface RunResult {
	readonly exitCode: number;
	readonly stdout: string;
	readonly stderr: string;
	readonly durationMs: number;
	readonly timedOut: boolean;
}

export interface HemCli {
	readonly run: (
		args: readonly string[],
		options?: RunHemOptions
	) => Promise<RunResult>;
	readonly expectExit: (
		result: RunResult,
		expected: number,
		label?: string
	) => void;
}

const normalizeLines = (value: string) => value.replaceAll('\r\n', '\n');

const tail = (value: string, length: number) =>
	value.length > length ? `...${value.slice(-length)}` : value;

const expectExit = (result: RunResult, expected: number, label = 'hem') => {
	if (result.exitCode === expected && !result.timedOut) return;

	console.error(
		`[${label}] expected exit ${expected}, got ${result.exitCode} after ${result.durationMs}ms`
	);
	console.error(
		`[${label}] stderr (last 2000):\n${tail(result.stderr, 2000)}`
	);
	console.error(
		`[${label}] stdout (last 1000):\n${tail(result.stdout, 1000)}`
	);
	throw new Error(
		`${label}: expected exit ${expected}, got ${result.exitCode}`
	);
};

export const makeHemCli = (fixture: HemE2eFixture): HemCli => ({
	expectExit,
	run: async (args, options) => {
		const start = Date.now();
		const timeoutMs = options?.timeoutMs ?? 30_000;
		let timedOut = false;

		const proc = Bun.spawn({
			cmd: ['bun', hemEntry, ...args],
			cwd: options?.cwd ?? fixture.projectDir,
			env: {
				...process.env,
				...fixture.env,
				...options?.env,
			},
			stderr: 'pipe',
			stdin:
				options?.stdin === undefined
					? 'ignore'
					: new Blob([options.stdin]),
			stdout: 'pipe',
		});

		const stdout = new Response(proc.stdout).text();
		const stderr = new Response(proc.stderr).text();
		const timer = setTimeout(() => {
			timedOut = true;
			proc.kill();
		}, timeoutMs);

		const exitCode = await proc.exited.finally(() => clearTimeout(timer));

		return {
			durationMs: Date.now() - start,
			exitCode: timedOut ? -1 : exitCode,
			stderr: normalizeLines(await stderr),
			stdout: normalizeLines(await stdout),
			timedOut,
		};
	},
});
