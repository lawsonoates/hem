# hem

Hem is a Bun-powered CLI for running commands with local, provider-backed
environment variables.

It mints short-scoped provider tokens, stores the secret value in the system
keychain through `Bun.secrets`, records non-secret metadata in
`.hem/secrets.json`, and injects those values into a child process when you run
a command through `hem`.

Cloudflare is the first supported provider.

## Install

Install workspace dependencies with Bun:

```bash
bun install
```

## Usage

During development, run the CLI entrypoint directly:

```bash
bun run packages/cli/src/index.ts --help
```

If the `hem` binary is on your `PATH`, use the shorter form shown below.

### Connect Cloudflare

Connect Hem to Cloudflare once before minting Cloudflare-backed env vars. The
Cloudflare API token you enter must be allowed to create API tokens.

```bash
hem connect cloudflare
```

Hem stores these provider credentials in the system keychain separately from
project env vars. They are not written to `.hem/secrets.json` or injected into
commands.

### Add a Cloudflare-backed env var

Mint and store an env var:

```bash
hem env add R2_TOKEN \
  --from cloudflare \
  --permission "Workers R2 Storage Write" \
  --expires-on 2026-12-31T00:00:00Z
```

You can repeat `--permission` to grant multiple Cloudflare token permission
groups. Permission names must match Cloudflare's token permission group names.

### List managed env vars

```bash
hem env list
```

This prints metadata such as the env var name, provider, permissions, and
expiration. Secret values are not printed.

### Run a command with managed env vars

```bash
hem -- bun run start
```

or, equivalently:

```bash
hem bun run start
```

Hem reads `.hem/secrets.json`, resolves each secret from the system keychain,
and starts the command with those values added to the process environment.

### Remove a managed env var

```bash
hem env rm R2_TOKEN
```

This removes the env var from `.hem/secrets.json` and deletes the stored value
from the system keychain.

## Development

Useful workspace commands:

```bash
bun run typecheck
bun run check
bun run fix
```
