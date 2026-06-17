import * as User from '@distilled.cloud/cloudflare/user';
import * as Zones from '@distilled.cloud/cloudflare/zones';
import { Effect, Stream } from 'effect';

import type { Grant, Scope } from '../grant';
import { ProviderRequestError } from '../provider';

const PROVIDER = 'cloudflare';

/** Canonical `<service>:<access>` keys → Cloudflare permission group names. */
const CAPABILITIES: Record<string, readonly string[]> = {
	'dns:edit': ['DNS Write'],
	'dns:read': ['DNS Read'],
	'r2:read': ['Workers R2 Storage Read'],
	'r2:write': ['Workers R2 Storage Write'],
	'workers:deploy': ['Workers Scripts Write'],
	'workers:read': ['Workers Scripts Read'],
};

/** A single Cloudflare access policy, ready to pass to `User.createToken`. */
export interface CloudflarePolicy {
	effect: 'allow';
	permissionGroups: { id: string }[];
	resources: Record<string, string>;
}

const missingScopeId = (type: string) =>
	new ProviderRequestError({
		message: `The "${type}" scope needs an id, for example "@${type}/<id>".`,
		provider: PROVIDER,
	});

/** Fetch every token permission group once and index it by name. */
const loadPermissionGroupIds = Effect.gen(function* () {
	const groups = yield* Stream.runCollect(
		User.listTokenPermissionGroups.items({})
	);
	return new Map(
		[...groups].flatMap((group) =>
			group.id && group.name ? [[group.name, group.id] as const] : []
		)
	);
});

/** Resolve the given zone names to their ids, failing on any unknown name. */
const loadZoneIds = (names: ReadonlySet<string>) =>
	Effect.gen(function* () {
		const zones = yield* Stream.runCollect(Zones.listZones.items({}));
		const idByName = new Map(
			[...zones].flatMap((zone) =>
				zone.id && zone.name ? [[zone.name, zone.id] as const] : []
			)
		);
		for (const name of names) {
			if (!idByName.has(name)) {
				return yield* new ProviderRequestError({
					message: `Unknown Cloudflare zone "${name}".`,
					provider: PROVIDER,
				});
			}
		}
		return idByName;
	});

/** The Cloudflare permission group names a grant maps to. */
const permissionNamesFor = (
	grant: Grant
): Effect.Effect<readonly string[], ProviderRequestError> => {
	const key = `${grant.service}:${grant.access}`;
	const names = CAPABILITIES[key];
	return names
		? Effect.succeed(names)
		: new ProviderRequestError({
				message: `Cloudflare has no mapping for "${key}".`,
				provider: PROVIDER,
			});
};

/** The Cloudflare `resources` map a scope translates to. */
const resourcesFor = (
	scope: Scope,
	accountResource: string,
	zoneIds: ReadonlyMap<string, string>
): Effect.Effect<Record<string, string>, ProviderRequestError> => {
	switch (scope.type) {
		case 'account': {
			return Effect.succeed({ [accountResource]: '*' });
		}
		case 'bucket': {
			return scope.id
				? Effect.succeed({
						[`${accountResource}.r2.bucket.${scope.id}`]: '*',
					})
				: missingScopeId('bucket');
		}
		case 'zone': {
			if (!scope.id) return missingScopeId('zone');
			const id = zoneIds.get(scope.id);
			return id
				? Effect.succeed({ [`${accountResource}.zone.${id}`]: '*' })
				: new ProviderRequestError({
						message: `Unknown Cloudflare zone "${scope.id}".`,
						provider: PROVIDER,
					});
		}
		default: {
			return new ProviderRequestError({
				message: `Unsupported scope "${scope.type}" for Cloudflare.`,
				provider: PROVIDER,
			});
		}
	}
};

/** Collapse resolved grants into one policy per resource set. */
const mergePolicies = (
	entries: readonly {
		readonly permissionGroups: readonly { readonly id: string }[];
		readonly resources: Record<string, string>;
	}[]
): CloudflarePolicy[] => {
	const byKey = new Map<string, CloudflarePolicy & { seen: Set<string> }>();

	for (const entry of entries) {
		const key = Object.keys(entry.resources).toSorted().join(',');
		const policy = byKey.get(key) ?? {
			effect: 'allow' as const,
			permissionGroups: [],
			resources: entry.resources,
			seen: new Set<string>(),
		};
		for (const group of entry.permissionGroups) {
			if (!policy.seen.has(group.id)) {
				policy.seen.add(group.id);
				policy.permissionGroups.push({ id: group.id });
			}
		}
		byKey.set(key, policy);
	}

	return [...byKey.values()].map(
		({ effect, permissionGroups, resources }) => ({
			effect,
			permissionGroups,
			resources,
		})
	);
};

/**
 * Translate provider-agnostic grants into Cloudflare access policies. Permission
 * groups and zones are resolved against the live account; grants sharing a
 * resource set are merged into a single policy.
 */
export const translateGrants = (grants: readonly Grant[], accountId: string) =>
	Effect.gen(function* () {
		const accountResource = `com.cloudflare.api.account.${accountId}`;
		const permissionGroupIds = yield* loadPermissionGroupIds;

		const zoneNames = new Set(
			grants.flatMap((grant) =>
				grant.scope.type === 'zone' && grant.scope.id
					? [grant.scope.id]
					: []
			)
		);
		const zoneIds =
			zoneNames.size > 0
				? yield* loadZoneIds(zoneNames)
				: new Map<string, string>();

		const resolved = yield* Effect.all(
			grants.map((grant) =>
				Effect.gen(function* () {
					const names = yield* permissionNamesFor(grant);
					const permissionGroups = yield* Effect.all(
						names.map((name) => {
							const id = permissionGroupIds.get(name);
							return id
								? Effect.succeed({ id })
								: new ProviderRequestError({
										message: `Unknown Cloudflare permission group "${name}".`,
										provider: PROVIDER,
									});
						})
					);
					const resources = yield* resourcesFor(
						grant.scope,
						accountResource,
						zoneIds
					);
					return { permissionGroups, resources };
				})
			),
			{ concurrency: 'unbounded' }
		);

		return mergePolicies(resolved);
	});
