import { Effect } from 'effect';

import type { Grant, Scope } from '../grant';
import { ProviderRequestError } from '../provider';

const PROVIDER = 'aws';

/** Canonical `<service>:<access>` keys → IAM action names. */
const CAPABILITIES: Record<string, readonly string[]> = {
	'dynamodb:read': ['dynamodb:GetItem', 'dynamodb:Query', 'dynamodb:Scan'],
	'dynamodb:write': [
		'dynamodb:PutItem',
		'dynamodb:UpdateItem',
		'dynamodb:DeleteItem',
	],
	's3:read': ['s3:GetObject', 's3:ListBucket'],
	's3:write': ['s3:PutObject', 's3:DeleteObject'],
};

export interface AwsContext {
	readonly accountId: string;
	readonly region: string;
}

interface IamStatement {
	readonly Action: readonly string[];
	readonly Effect: 'Allow';
	readonly Resource: readonly string[];
}

const missingScopeId = (type: string) =>
	new ProviderRequestError({
		message: `The "${type}" scope needs an id, for example "@${type}/<id>".`,
		provider: PROVIDER,
	});

const partitionFor = (region: string) => {
	if (region.startsWith('cn-')) return 'aws-cn';
	if (region.startsWith('us-gov-')) return 'aws-us-gov';
	return 'aws';
};

const actionsFor = (
	grant: Grant
): Effect.Effect<readonly string[], ProviderRequestError> => {
	const key = `${grant.service}:${grant.access}`;
	const actions = CAPABILITIES[key];
	return actions
		? Effect.succeed(actions)
		: new ProviderRequestError({
				message: `AWS has no mapping for "${key}".`,
				provider: PROVIDER,
			});
};

const resourcesFor = (
	scope: Scope,
	ctx: AwsContext
): Effect.Effect<readonly string[], ProviderRequestError> => {
	const partition = partitionFor(ctx.region);

	switch (scope.type) {
		case 'account': {
			return Effect.succeed(['*']);
		}
		case 'bucket': {
			if (!scope.id) return missingScopeId('bucket');
			const bucket = scope.id;
			return Effect.succeed([
				`arn:${partition}:s3:::${bucket}`,
				`arn:${partition}:s3:::${bucket}/*`,
			]);
		}
		case 'table': {
			if (!scope.id) return missingScopeId('table');
			return Effect.succeed([
				`arn:${partition}:dynamodb:${ctx.region}:${ctx.accountId}:table/${scope.id}`,
			]);
		}
		default: {
			return new ProviderRequestError({
				message: `Unsupported scope "${scope.type}" for AWS.`,
				provider: PROVIDER,
			});
		}
	}
};

const mergeStatements = (
	statements: readonly IamStatement[]
): readonly IamStatement[] => {
	const byKey = new Map<
		string,
		{
			Action: string[];
			Effect: 'Allow';
			Resource: readonly string[];
			seen: Set<string>;
		}
	>();

	for (const statement of statements) {
		const key = [...statement.Resource].toSorted().join(',');
		const merged = byKey.get(key) ?? {
			Action: [],
			Effect: 'Allow' as const,
			Resource: statement.Resource,
			seen: new Set<string>(),
		};
		for (const action of statement.Action) {
			if (!merged.seen.has(action)) {
				merged.seen.add(action);
				merged.Action.push(action);
			}
		}
		byKey.set(key, merged);
	}

	return [...byKey.values()].map(({ Action, Effect, Resource }) => ({
		Action,
		Effect,
		Resource,
	}));
};

/** Translate provider-agnostic grants into an inline IAM session policy. */
export const translateGrants = (grants: readonly Grant[], ctx: AwsContext) =>
	Effect.gen(function* () {
		const resolved = yield* Effect.all(
			grants.map((grant) =>
				Effect.gen(function* () {
					const actions = yield* actionsFor(grant);
					const resources = yield* resourcesFor(grant.scope, ctx);
					return {
						Action: actions,
						Effect: 'Allow' as const,
						Resource: resources,
					} satisfies IamStatement;
				})
			),
			{ concurrency: 'unbounded' }
		);

		if (resolved.length === 0) {
			return yield* new ProviderRequestError({
				message:
					'At least one permission is required to mint AWS credentials.',
				provider: PROVIDER,
			});
		}

		return JSON.stringify({
			Statement: mergeStatements(resolved),
			Version: '2012-10-17',
		});
	});
