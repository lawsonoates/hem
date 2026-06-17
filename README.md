# hem

A CLI for agents to create, manage and use secrets. Encrypts secrets locally while giving agents discoverability and metadata on secrets. Works alongside existing `.env`.

Supports Cloudflare and AWS.

## Usage

1. Connect and add credentials

```bash
# Cloudflare
hem connect cloudflare

hem env add \
  --from cloudflare \
  --permission "r2:write"

# AWS
hem connect aws

hem env add \
  --from aws \
  --permission "s3:read@bucket/uploads"
```

2. Use `hem` to run with secrets

```bash
hem bun dev
```

## Env var labels

Each provider mints credentials under fixed env var names:

| Provider   | Labels                                                            |
| ---------- | ----------------------------------------------------------------- |
| cloudflare | `CLOUDFLARE_API_TOKEN`                                            |
| aws        | `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN` |

Only one bundle per provider can be active at a time. `hem env rm <label>`
removes the whole bundle that contains that label.

## Permissions

`--permission` uses a uniform grant syntax. The vocabulary is
**provider-specific** — `r2:*` on Cloudflare, `s3:*` on AWS — but the grammar
is the same:

```
<service>:<access>[@<scope-type>/<id>]
```

```bash
# Cloudflare
--permission "r2:write"                     # whole account
--permission "r2:read@bucket/uploads"       # scoped to one R2 bucket
--permission "dns:edit@zone/example.com"    # scoped to one zone

# AWS
--permission "s3:read@bucket/uploads"       # scoped to one S3 bucket
--permission "dynamodb:read@table/my-table" # scoped to one DynamoDB table
```

Token lifetime is whatever the provider API returns. Region is set at
`hem connect aws` time.
