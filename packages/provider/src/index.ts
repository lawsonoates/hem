export { type Grant, GrantParseError, parseGrant, type Scope } from './grant';

export const providers = ['cloudflare', 'aws'] as const;
export type Provider = (typeof providers)[number];
