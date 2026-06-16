# hem

A CLI for agents to create, manage and use secrets. Encrypts secrets locally while giving agents discoverability and metadata on secrets. Works alongside existing `.env`.

Currently only supports cloudflare.

## Usage

1. Connect and add token

```bash
hem connect cloudflare

hem env add R2_TOKEN \
  --from cloudflare \
  --permission "r2:write"
```

2. Use `hem` to run with secrets

```bash
hem bun dev
```

## Permissions

`--permission` takes a provider-agnostic grant and can be repeated:

```
[allow|deny] <service>:<access>[@<scope-type>/<id>]
```

```bash
--permission "r2:write"                     # whole account
--permission "r2:read@bucket/uploads"       # scoped to one R2 bucket
--permission "dns:edit@zone/example.com"    # scoped to one zone
--permission "deny r2:write"                # explicit deny
--permission "raw:Workers R2 Storage Write" # Cloudflare permission group, verbatim
```

`<service>:<access>` maps to each provider's native permissions; `raw:` passes a
provider permission through untranslated for anything not yet mapped.
