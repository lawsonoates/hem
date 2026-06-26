import { Config, Effect, Schema } from 'effect';
import { HttpServerRequest, HttpServerResponse } from 'effect/unstable/http';

import { HemAuth } from '../auth';
import {
	AuthRequestError,
	DeviceAuthorizationPending,
	DeviceAuthorizationSlowDown,
} from '../errors';

const AuthErrorBody = Schema.Struct({
	error: Schema.String,
	error_description: Schema.optional(Schema.String),
});

interface AuthForwardInput {
	readonly body?: unknown;
	readonly method: 'GET' | 'POST';
	readonly path: string;
	readonly searchParams?: Readonly<Record<string, string>>;
}

const authErrorMessage = (body: unknown, status: number) => {
	if (
		typeof body === 'object' &&
		body !== null &&
		'message' in body &&
		typeof body.message === 'string'
	)
		return body.message;

	const decoded = Schema.decodeUnknownOption(AuthErrorBody)(body);
	if (decoded._tag === 'Some') {
		return (
			decoded.value.error_description ??
			`Auth request failed with ${decoded.value.error}.`
		);
	}

	return `Auth request failed with HTTP ${status}.`;
};

const readJsonBody = (response: Response) =>
	Effect.tryPromise({
		catch: () =>
			new AuthRequestError({
				message: 'Auth response was not valid JSON.',
			}),
		try: async () => {
			const text = await response.text();
			if (!text) return;
			return JSON.parse(text) as unknown;
		},
	});

const apiUrl = Config.string('HEM_API_URL').pipe(
	Effect.mapError(
		() =>
			new AuthRequestError({
				message: 'HEM_API_URL is not configured.',
			})
	)
);

const forwardAuthWeb = (input: AuthForwardInput) =>
	Effect.gen(function* () {
		const auth = yield* HemAuth.Service;
		const baseUrl = yield* apiUrl;
		const serverRequest = yield* HttpServerRequest.HttpServerRequest;
		const url = new URL(`${baseUrl}${input.path}`);
		if (input.searchParams) {
			for (const [key, value] of Object.entries(input.searchParams))
				url.searchParams.set(key, value);
		}

		const headers = new Headers(serverRequest.headers);
		if (input.body !== undefined && !headers.has('content-type'))
			headers.set('content-type', 'application/json');

		const request = new Request(url.href, {
			body:
				input.body === undefined
					? undefined
					: JSON.stringify(input.body),
			headers,
			method: input.method,
		});
		return yield* Effect.promise(() => auth.handler(request));
	});

export const forwardAuth = (input: AuthForwardInput) =>
	Effect.gen(function* () {
		const response = yield* forwardAuthWeb(input);
		const body = yield* readJsonBody(response).pipe(
			Effect.catchTag('AuthRequestError', () => Effect.void)
		);
		return { body, response } as const;
	});

export const forwardAuthResponse = (input: AuthForwardInput) =>
	Effect.map(forwardAuthWeb(input), (response) =>
		HttpServerResponse.fromWeb(response)
	);

export const decodeAuthSuccess = <A>(
	schema: Schema.Schema<A>,
	response: Response,
	body: unknown
) => {
	if (!response.ok) {
		return Effect.fail(
			new AuthRequestError({
				message: authErrorMessage(body, response.status),
			})
		);
	}

	return Schema.decodeUnknownEffect(schema)(body).pipe(
		Effect.mapError(
			() =>
				new AuthRequestError({
					message: 'Auth response did not match the expected schema.',
				})
		)
	);
};

export const mapDeviceTokenResponse = <A>(
	schema: Schema.Schema<A>,
	response: Response,
	body: unknown
) => {
	if (response.status === 400) {
		const decoded = Schema.decodeUnknownOption(AuthErrorBody)(body);
		if (decoded._tag === 'Some') {
			if (decoded.value.error === 'authorization_pending') {
				return Effect.fail(
					new DeviceAuthorizationPending({
						message:
							decoded.value.error_description ??
							'Device authorization is pending.',
					})
				);
			}
			if (decoded.value.error === 'slow_down') {
				return Effect.fail(
					new DeviceAuthorizationSlowDown({
						message:
							decoded.value.error_description ??
							'Device authorization polling is too frequent.',
					})
				);
			}
		}
	}

	return decodeAuthSuccess(schema, response, body);
};
