# hem

A CLI for agents to create, manage and use secrets. Encrypts secrets locally while giving agents discoverability and metadata on secrets. Works alongside existing `.env`.

Supports GitHub. The `hem connect cloudflare` and `hem connect aws` commands are
still present, but Cloudflare and AWS are disabled for now.

## Usage

1. Connect and add credentials

```bash
# Interactive: choose a connector or manual token
hem env add

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

| Provider | Labels         |
| -------- | -------------- |
| github   | `GITHUB_TOKEN` |

Only one bundle per provider can be active at a time. `hem env rm <label>`
removes the whole bundle that contains that label.

## How scoping works

Permissions are not specified at the CLI layer. Scope comes from:

- **GitHub:** repositories selected during GitHub App installation and
  permissions configured on the GitHub App

The `.hem/secrets.json` manifest records the provider `binding` so credentials can
be refreshed on `hem run`.
