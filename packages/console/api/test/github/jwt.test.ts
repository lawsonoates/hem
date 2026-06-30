import { expect, test } from 'bun:test';
import { generateKeyPairSync } from 'node:crypto';

import { Effect, Redacted, Schema } from 'effect';

import { createGithubAppJwt } from '../../src/connectors/github';

const toPem = (bytes: ArrayBuffer) => {
	const binary = String.fromCodePoint(...new Uint8Array(bytes));
	const base64 =
		btoa(binary)
			.match(/.{1,64}/gu)
			?.join('\n') ?? '';
	return `-----BEGIN PRIVATE KEY-----\n${base64}\n-----END PRIVATE KEY-----`;
};

const decodePart = (part: string) => {
	const base64 = part.replaceAll('-', '+').replaceAll('_', '/');
	return Schema.decodeUnknownSync(Schema.UnknownFromJsonString)(
		atob(base64)
	) as Record<string, unknown>;
};

const decodeBase64Url = (value: string) => {
	const base64 = value.replaceAll('-', '+').replaceAll('_', '/');
	const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
	return Uint8Array.from(
		atob(padded),
		(character) => character.codePointAt(0) ?? 0
	);
};

test('creates a bounded GitHub App JWT', async () => {
	const key = (await crypto.subtle.generateKey(
		{
			hash: 'SHA-256',
			modulusLength: 2048,
			name: 'RSASSA-PKCS1-v1_5',
			publicExponent: new Uint8Array([1, 0, 1]),
		},
		true,
		['sign', 'verify']
	)) as CryptoKeyPair;
	const privateKey = await crypto.subtle.exportKey('pkcs8', key.privateKey);
	const token = await Effect.runPromise(
		createGithubAppJwt({
			appId: '1234',
			now: new Date('2026-06-18T00:00:00.000Z'),
			privateKey: Redacted.make(toPem(privateKey)),
		})
	);
	const [header, payload, signature] = token.split('.');

	expect(signature).toBeTruthy();
	expect(decodePart(header ?? '')).toEqual({ alg: 'RS256', typ: 'JWT' });
	expect(decodePart(payload ?? '')).toMatchObject({ iss: '1234' });
	expect(
		await crypto.subtle.verify(
			'RSASSA-PKCS1-v1_5',
			key.publicKey,
			decodeBase64Url(signature ?? ''),
			new TextEncoder().encode(`${header}.${payload}`)
		)
	).toBe(true);
});

test('accepts the PKCS#1 key format generated for GitHub Apps', async () => {
	const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
	const pem = privateKey.export({ format: 'pem', type: 'pkcs1' }).toString();
	const token = await Effect.runPromise(
		createGithubAppJwt({
			appId: '1234',
			now: new Date('2026-06-18T00:00:00.000Z'),
			privateKey: Redacted.make(pem),
		})
	);

	expect(token.split('.')).toHaveLength(3);
});
