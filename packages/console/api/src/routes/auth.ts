import { Effect, Schema } from 'effect';
import { HttpApiBuilder } from 'effect/unstable/httpapi';

import { HemApi } from '../api';
import type {
	ApproveDeviceRequest,
	EmailSignInRequest,
	EmailSignUpRequest,
	ExchangeDeviceTokenRequest,
	StartDeviceAuthorizationRequest,
} from '../schema';
import {
	AuthSession,
	AuthSuccess,
	AuthUser,
	DeviceAccessToken,
	DeviceAuthorization,
	DeviceClaim,
} from '../schema';
import {
	decodeAuthSuccess,
	forwardAuth,
	mapDeviceTokenResponse,
} from './auth-forward';

const AuthUserResponse = Schema.Struct({ user: AuthUser });

export const startDeviceAuthorization = (
	payload: StartDeviceAuthorizationRequest
) =>
	Effect.gen(function* () {
		const { body, response } = yield* forwardAuth({
			body: payload,
			method: 'POST',
			path: '/v1/auth/device/code',
		});
		return yield* decodeAuthSuccess(DeviceAuthorization, response, body);
	});

export const exchangeDeviceToken = (payload: ExchangeDeviceTokenRequest) =>
	Effect.gen(function* () {
		const { body, response } = yield* forwardAuth({
			body: payload,
			method: 'POST',
			path: '/v1/auth/device/token',
		});
		return yield* mapDeviceTokenResponse(
			DeviceAccessToken,
			response,
			body
		);
	});

export const getDeviceClaim = (userCode: string) =>
	Effect.gen(function* () {
		const { body, response } = yield* forwardAuth({
			method: 'GET',
			path: '/v1/auth/device',
			searchParams: { user_code: userCode },
		});
		return yield* decodeAuthSuccess(DeviceClaim, response, body);
	});

export const approveDevice = (payload: ApproveDeviceRequest) =>
	Effect.gen(function* () {
		const { body, response } = yield* forwardAuth({
			body: payload,
			method: 'POST',
			path: '/v1/auth/device/approve',
		});
		return yield* decodeAuthSuccess(AuthSuccess, response, body);
	});

export const signInEmail = (payload: EmailSignInRequest) =>
	Effect.gen(function* () {
		const { body, response } = yield* forwardAuth({
			body: payload,
			method: 'POST',
			path: '/v1/auth/sign-in/email',
		});
		return yield* decodeAuthSuccess(AuthUserResponse, response, body);
	});

export const signUpEmail = (payload: EmailSignUpRequest) =>
	Effect.gen(function* () {
		const { body, response } = yield* forwardAuth({
			body: payload,
			method: 'POST',
			path: '/v1/auth/sign-up/email',
		});
		return yield* decodeAuthSuccess(AuthUserResponse, response, body);
	});

export const getSession = () =>
	Effect.gen(function* () {
		const { body, response } = yield* forwardAuth({
			method: 'GET',
			path: '/v1/auth/get-session',
		});
		if (response.ok && (body === undefined || body === null)) return null;
		return yield* decodeAuthSuccess(
			Schema.NullOr(AuthSession),
			response,
			body
		);
	});

export const signOut = () =>
	Effect.gen(function* () {
		const { body, response } = yield* forwardAuth({
			method: 'POST',
			path: '/v1/auth/sign-out',
		});
		return yield* decodeAuthSuccess(AuthSuccess, response, body);
	});

export const AuthLive = HttpApiBuilder.group(HemApi, 'auth', (handlers) =>
	handlers
		.handle('startDeviceAuthorization', ({ payload }) =>
			startDeviceAuthorization(payload)
		)
		.handle('exchangeDeviceToken', ({ payload }) =>
			exchangeDeviceToken(payload)
		)
		.handle('getDeviceClaim', ({ query }) =>
			getDeviceClaim(query.user_code)
		)
		.handle('approveDevice', ({ payload }) => approveDevice(payload))
		.handle('signInEmail', ({ payload }) => signInEmail(payload))
		.handle('signUpEmail', ({ payload }) => signUpEmail(payload))
		.handle('getSession', () => getSession())
		.handle('signOut', () => signOut())
);