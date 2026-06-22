# hem

A CLI for agents to create, manage and use secrets. Encrypts secrets locally while giving agents discoverability and metadata on secrets. Works alongside existing `.env`.

Supports Cloudflare and GitHub. The `hem connect aws` command is still present,
but AWS is disabled for now.

## Usage

1. Connect and add credentials

```bash
# Interactive: choose a connector or manual token
hem env add

# Cloudflare
hem connect cloudflare
hem env add --from cloudflare

# GitHub
hem connect github

# Manual
hem env add API_TOKEN
```

2. Use `hem` to run with secrets

```bash
hem bun dev
```

`hem run` refreshes expired provider credentials automatically before injecting them.

## Env var labels

Manual env vars use the label you provide. Providers materialize credentials
under fixed env var names:

| Provider   | Labels                 |
| ---------- | ---------------------- |
| cloudflare | `CLOUDFLARE_API_TOKEN` |
| github     | `GITHUB_TOKEN`         |

Only one bundle per provider can be active at a time. `hem env rm <label>`
removes the whole bundle that contains that label.

## How scoping works

Permissions are not specified at the CLI layer. Scope comes from:

- **Cloudflare:** OAuth app scopes chosen during `hem connect cloudflare`
- **GitHub:** repositories selected during GitHub App installation and
  permissions configured on the GitHub App

The `.hem/secrets.json` manifest records the provider `binding` so credentials can
be refreshed on `hem run`.

## Cloudflare OAuth setup (maintainers)

Create a dev OAuth client (validates scopes against the API, writes `.env`):

```bash
export CLOUDFLARE_API_TOKEN="..."   # needs OAuth Clients Write
export CLOUDFLARE_ACCOUNT_ID="..."  # optional if token sees one account
bun run scripts/create-cloudflare-oauth-client.ts
```

Or set manually after dashboard setup:

```bash
export HEM_CLOUDFLARE_OAUTH_CLIENT_ID="your-client-id"
export HEM_CLOUDFLARE_OAUTH_SCOPES="account.read workers.r2.read workers.r2.write"
```

`HEM_CLOUDFLARE_OAUTH_SCOPES` must match the scope IDs on your OAuth client (space- or comma-separated).
