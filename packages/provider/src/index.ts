export const providers = ['cloudflare'] as const;
export type Provider = (typeof providers)[number];
