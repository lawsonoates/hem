# hem

A CLI for agents to create, manage and use secrets. Encrypts secrets locally while giving agents discoverability and metadata on secrets. Works alongside existing `.env`.

Currently only supports cloudflare.

## Usage

```bash
hem connect cloudflare

hem env add R2_TOKEN \
  --from cloudflare \
  --permission "Workers R2 Storage Write"

hem bun run dev
```
