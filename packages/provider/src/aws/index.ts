import { fromCredentials } from '@distilled.cloud/aws/Credentials';
import { Region } from '@distilled.cloud/aws/Region';
import * as Sts from '@distilled.cloud/aws/sts';
import { Effect, Layer, Redacted } from 'effect';
import { FetchHttpClient } from 'effect/unstable/http';

import type { Grant } from '../grant';
import type { Provider, ProviderError, Token } from '../provider';
import {
	ProviderAuthError,
	ProviderRateLimitError,
	ProviderRequestError,
	ProviderResponseError,
	ProviderUnavailableError,
} from '../provider';
import { translateGrants } from './permissions';

export interface AwsInput {
	readonly accessKeyId: string;
	readonly secretAccessKey: string;
	readonly region: string;
	readonly body: {
		readonly grants: readonly Grant[];
	};
}

const PROVIDER = 'aws';
const TOKEN_NAME = 'hem-aws';

export const DEFAULT_LABELS = [
	'AWS_ACCESS_KEY_ID',
	'AWS_SECRET_ACCESS_KEY',
	'AWS_SESSION_TOKEN',
] as const;

const redactedValue = (value: string | Redacted.Redacted<string>) =>
	typeof value === 'string' ? value : Redacted.value(value);

const toToken = (credentials: Sts.Credentials): Token | null => {
	const accessKeyId = credentials.AccessKeyId;
	const secretAccessKey = redactedValue(credentials.SecretAccessKey);
	const sessionToken = credentials.SessionToken;
	if (!accessKeyId || !secretAccessKey || !sessionToken) return null;

	return {
		expiresOn: credentials.Expiration.toISOString(),
		id: accessKeyId,
		issuedOn: new Date().toISOString(),
		name: 'hem:aws',
		values: [accessKeyId, secretAccessKey, sessionToken],
	};
};

const awsErrorMessage = (
	error: {
		readonly errorData?: unknown;
		readonly message?: string;
	},
	fallback: string
) => {
	const message = error.message?.trim();
	if (message) return message;

	const errorData = error.errorData;
	if (typeof errorData === 'object' && errorData !== null) {
		const dataMessage = (errorData as { readonly Message?: unknown })
			.Message;
		if (typeof dataMessage === 'string' && dataMessage.trim()) {
			return dataMessage;
		}
	}

	return fallback;
};

const mapAwsError = (error: {
	readonly errorData?: unknown;
	readonly _tag: string;
	readonly message?: string;
}): ProviderError => {
	switch (error._tag) {
		case 'ProviderAuthError':
		case 'ProviderRateLimitError':
		case 'ProviderRequestError':
		case 'ProviderResponseError':
		case 'ProviderUnavailableError': {
			return error as ProviderError;
		}
		case 'AccessDeniedException':
		case 'ExpiredTokenException':
		case 'IncompleteSignature':
		case 'NotAuthorized':
		case 'OptInRequired':
		case 'UnrecognizedClientException': {
			return new ProviderAuthError({
				cause: error,
				message: awsErrorMessage(
					error,
					'AWS rejected the credentials.'
				),
				provider: PROVIDER,
			});
		}
		case 'ThrottlingException': {
			return new ProviderRateLimitError({
				cause: error,
				message: awsErrorMessage(error, 'AWS rate limit exceeded.'),
				provider: PROVIDER,
			});
		}
		case 'InternalFailure':
		case 'InternalError':
		case 'ServiceUnavailable': {
			return new ProviderUnavailableError({
				cause: error,
				message: awsErrorMessage(
					error,
					'AWS is temporarily unavailable.'
				),
				provider: PROVIDER,
			});
		}
		case 'MalformedHttpRequestException':
		case 'MalformedPolicyDocumentException':
		case 'PackedPolicyTooLargeException':
		case 'RegionDisabledException':
		case 'RequestEntityTooLargeException':
		case 'RequestExpired':
		case 'UnknownOperationException':
		case 'ValidationError':
		case 'ValidationException': {
			return new ProviderRequestError({
				cause: error,
				message: awsErrorMessage(error, 'AWS rejected the request.'),
				provider: PROVIDER,
			});
		}
		case 'UnknownAwsError':
		case 'TransientFetchError':
		case 'EndpointError': {
			return new ProviderResponseError({
				cause: error,
				message: awsErrorMessage(
					error,
					'AWS returned an unexpected response.'
				),
				provider: PROVIDER,
			});
		}
		default: {
			return new ProviderResponseError({
				cause: error,
				message: 'Unexpected AWS error.',
				provider: PROVIDER,
			});
		}
	}
};

export const aws = (input: AwsInput): Provider => ({
	defaultLabels: DEFAULT_LABELS,
	mint: () =>
		Effect.gen(function* () {
			const { region } = input;

			const identity = yield* Sts.getCallerIdentity({});
			const accountId = identity.Account;
			if (!accountId) {
				return yield* new ProviderResponseError({
					message:
						'AWS STS did not return an account id for the connected principal.',
					provider: PROVIDER,
				});
			}

			const policy = yield* translateGrants(input.body.grants, {
				accountId,
				region,
			});

			const result = yield* Sts.getFederationToken({
				Name: TOKEN_NAME,
				Policy: policy,
			});

			const credentials = result.Credentials;
			if (!credentials) {
				return yield* new ProviderResponseError({
					message:
						'AWS STS returned an incomplete federation token response.',
					provider: PROVIDER,
				});
			}

			const token = toToken(credentials);
			if (!token) {
				return yield* new ProviderResponseError({
					message:
						'AWS STS returned incomplete federation credentials.',
					provider: PROVIDER,
				});
			}
			return token;
		}).pipe(
			Effect.mapError(mapAwsError),
			Effect.provide(
				Layer.mergeAll(
					fromCredentials({
						accessKeyId: input.accessKeyId,
						secretAccessKey: input.secretAccessKey,
					}),
					Layer.succeed(Region, Effect.succeed(input.region)),
					FetchHttpClient.layer
				)
			)
		),
});
