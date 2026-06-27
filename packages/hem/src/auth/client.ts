import {
	DeviceAccessToken,
	DeviceAuthorization,
	type ExchangeDeviceTokenRequest,
	type StartDeviceAuthorizationRequest,
} from '@hem/console-api/schema';
import { HemError } from '@hem/core/error';
import { Effect, Schema } from 'effect';
import { HttpClient, HttpClientRequest } from 'effect/unstable/http';

import { apiBaseUrl } from './session';

const AuthErrorBody = Schema.Struct({
	error: Schema.String,
	error_description: Schema.optional(Schema.String),
	message: Schema.optional(Schema.String),
});

export class DeviceAuthorizationPending extends Schema.TaggedErrorClass<DeviceAuthorizationPending>()(
	'DeviceAuthorizationPending',
	{ message: Schema.String }
) {}

export class DeviceAuthorizationSlowDown extends Schema.TaggedErrorClass<DeviceAuthorizationSlowDown>()(
	'DeviceAuthorizationSlowDown',
	{ message: Schema.String }
) {}

const authUrl = (path: string) =>
	Effect.map(apiBaseUrl, (baseUrl) => new URL(path, baseUrl).toString());

const authErrorMessage = (body: unknown, status: number) => {
	const decoded = Schema.decodeUnknownOption(AuthErrorBody)(body);
	if (decoded._tag === 'Some') {
		return (
			decoded.value.error_description ??
			decoded.value.message ??
			`Auth request failed with ${decoded.value.error}.`
		);
	}
	return `Auth request failed with HTTP ${status}.`;
};

const authRequestJson = (input: {
	readonly accessToken?: string;
	readonly body?: unknown;
	readonly method: 'GET' | 'POST';
	readonly path: string;
}) =>
	Effect.gen(function* () {
		const client = yield* HttpClient.HttpClient;
		const url = yield* authUrl(input.path);
		let request =
			input.method === 'GET'
				? HttpClientRequest.get(url)
				: HttpClientRequest.post(url);

		request = request.pipe(HttpClientRequest.acceptJson);
		if (input.body !== undefined) {
			request = request.pipe(
				HttpClientRequest.bodyJsonUnsafe(input.body)
			);
		}
		if (input.accessToken) {
			request = request.pipe(
				HttpClientRequest.bearerToken(input.accessToken)
			);
		}

		const response = yield* client.execute(request).pipe(
			Effect.mapError(
				(error) =>
					new HemError({
						message: error.message,
					})
			)
		);
		const body = yield* response.json.pipe(
			Effect.mapError(
				() =>
					new HemError({
						message: 'Auth response was not valid JSON.',
					})
			)
		);
		return { body, status: response.status } as const;
	});

const decodeAuthSuccess = <A>(
	schema: Schema.Schema<A>,
	status: number,
	body: unknown
) => {
	if (status < 200 || status >= 300) {
		return Effect.fail(
			new HemError({ message: authErrorMessage(body, status) })
		);
	}

	return Schema.decodeUnknownEffect(schema)(body).pipe(
		Effect.mapError(
			() =>
				new HemError({
					message: 'Auth response did not match the expected schema.',
				})
		)
	);
};

export const startDeviceAuthorization = (
	body: StartDeviceAuthorizationRequest
) =>
	Effect.gen(function* () {
		const response = yield* authRequestJson({
			body,
			method: 'POST',
			path: '/v1/auth/device/code',
		});
		return yield* decodeAuthSuccess(
			DeviceAuthorization,
			response.status,
			response.body
		);
	});

export const exchangeDeviceToken = (body: ExchangeDeviceTokenRequest) =>
	Effect.gen(function* () {
		const response = yield* authRequestJson({
			body,
			method: 'POST',
			path: '/v1/auth/device/token',
		});
		if (response.status === 400) {
			const decoded = Schema.decodeUnknownOption(AuthErrorBody)(
				response.body
			);
			if (decoded._tag === 'Some') {
				if (decoded.value.error === 'authorization_pending') {
					return yield* new DeviceAuthorizationPending({
						message:
							decoded.value.error_description ??
							'Device authorization is pending.',
					});
				}
				if (decoded.value.error === 'slow_down') {
					return yield* new DeviceAuthorizationSlowDown({
						message:
							decoded.value.error_description ??
							'Device authorization polling is too frequent.',
					});
				}
			}
		}

		return yield* decodeAuthSuccess(
			DeviceAccessToken,
			response.status,
			response.body
		);
	});

export const signOut = (accessToken: string) =>
	authRequestJson({
		accessToken,
		method: 'POST',
		path: '/v1/auth/sign-out',
	}).pipe(Effect.ignore);
