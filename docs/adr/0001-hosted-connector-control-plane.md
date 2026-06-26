# ADR 0001: Hosted control plane for managed connectors

- Status: Accepted
- Date: 2026-06-18
- Amended: 2026-06-22 (GitHub bindings inherit installation scope)

## Context

Hem needs to let a user authorize a third-party provider once and then issue
appropriately scoped credentials to their projects at runtime. Provider
credential lifecycles vary: some refresh OAuth access tokens, some mint
installation tokens, and some can only return a static API key.

GitHub Apps provide a useful first managed connector. A GitHub App is installed
for a user or organization, and its installation can issue short-lived access
tokens. Repository access is selected when the App is installed, and permissions
are defined by the App configuration. Issuing those tokens requires the GitHub
App private key. Shipping that private key in the Hem CLI would compromise every
installation, so a fully local implementation cannot safely provide a
Hem-managed GitHub connector.

## Decision

Hem will use a hosted control plane for managed connectors. The CLI remains the
local runtime, or data plane.

The control plane is responsible for:

- holding connector-level credentials such as a GitHub App private key;
- completing provider authorization and installation flows;
- recording installation ownership and provider tenant identity;
- authorizing bindings to provider installations;
- issuing credentials within the provider installation's grant;
- recording credential issuance metadata; and
- revoking bindings and installations where the provider supports it.

The CLI is responsible for:

- authenticating the user with Hem;
- starting provider installation flows in the browser;
- declaring a project binding for an installation;
- requesting a credential lease immediately before running a command; and
- injecting leased values into the child process.

The CLI must not receive connector-level credentials. Runtime credentials must
not be written to `.hem/secrets.json`; they should remain in memory for the
command lifetime unless a provider requires a different, explicitly documented
strategy.

Hem user authentication, provider installation, and runtime credential issuance
are separate operations:

```text
Hem login             -> identifies the Hem user
Provider installation -> authorizes a provider tenant
Credential lease      -> authorizes a particular runtime use
```

## Architecture

```text
Provider
   ^
   | authorize / mint / revoke
   |
Hem control plane
   ^
   | authenticated installation and lease API
   |
Hem CLI -> child process with temporary environment values
```

The control plane is not a general proxy for provider APIs. After issuance, the
child process calls the provider directly.

## Domain model

### Connector definition

A connector definition is server code and configuration that implements a
provider's authorization and issuance behavior. It is not an API resource or
user-created installation state. The first connector will be the Hem-managed
GitHub App.

### Installation

An installation represents authorization of one connector for one provider
tenant. It is reusable across projects.

```ts
interface Installation {
	id: string;
	connector: 'github';
	providerInstallationId: string;
	account: {
		id: string;
		name: string;
		type: 'user' | 'organization';
	};
}
```

Installation responses contain metadata only. Provider secrets and connector
private keys are never included. The control plane associates each installation
with the authenticated Hem owner internally.

### Binding

A binding associates a project with an installation. The project stores the
binding ID in its local manifest; there is no server-side project or environment
resource in the initial model. The binding does not narrow the installation:
repository access comes from the choices made during GitHub App installation,
and permissions come from the GitHub App configuration.

```ts
interface Binding {
	id: string;
	installationId: string;
}
```

The binding inherits ownership through its installation. The control plane
stores the authoritative binding so it can enforce issuance. For GitHub, the
output name is fixed as `GITHUB_TOKEN` rather than configured per binding.

The project manifest stores only the binding reference and output name:

```json
{
	"bindingId": "bind_123",
	"outputs": ["GITHUB_TOKEN"]
}
```

### Credential lease

A credential lease is a short-lived response produced for one authorized
binding. The returned values are sensitive and are delivered only to the
authenticated CLI that requested them.

```ts
interface CredentialLease {
	values: {
		GITHUB_TOKEN: string;
	};
	expiresAt: string;
}
```

The response contains only what the CLI needs to run the child process. The
server may retain separate issuance metadata for audit purposes, but must never
log or persist the returned credential values. A lease inherits the full grant
of its installation.

## Initial API surface

The first vertical slice requires these operations:

```text
POST   /v1/connectors/github/installations
GET    /v1/connectors/github/callback
POST   /v1/bindings
POST   /v1/credential-leases
```

Creating a GitHub installation returns a short-lived authorization URL. The
callback validates its state and records the provider installation. Creating a
credential lease authenticates the CLI, loads the binding and installation,
signs a GitHub App JWT on the server, and exchanges it for a GitHub installation
access token without an additional scope body.

Authentication and error schemas will be specified separately before the API is
implemented.

## Security invariants

- Connector-level private keys exist only in the control-plane secret store.
- Every installation has an explicit Hem owner, and bindings inherit that
  ownership.
- A binding identifier alone is not authority to request a lease.
- Lease issuance requires an authenticated Hem principal authorized for the
  binding.
- GitHub repository access is controlled by the installation, and permissions
  are controlled by the GitHub App configuration.
- Credential values are never placed in logs, audit events, or project files.
- Provider tokens are minted just in time and are not cached initially.
- Revoking an installation prevents all of its bindings from issuing new
  leases.

## First vertical slice: GitHub

The GitHub implementation maps directly to the model:

```text
Connector definition -> Hem GitHub App
Installation         -> GitHub App installation for a user or organization
Binding              -> project reference to an installation
Credential lease     -> short-lived GitHub installation access token
```

The initial end-to-end behavior is:

1. The user authenticates the CLI with Hem.
2. `hem connect github` opens the server-created GitHub App installation URL.
3. The control plane records the completed installation.
4. The control plane creates an installation binding, and the CLI stores its
   reference in the project manifest.
5. `hem run` requests a credential lease for that binding.
6. The CLI injects the returned token into the child process and discards it
   when the process exits.

Cloudflare will not be migrated to this model before the GitHub vertical slice
validates it. The existing Cloudflare implementation can then be removed or
reintroduced later as a connector with an explicitly supported issuance
strategy.

## Consequences

### Positive

- Managed connector secrets are not distributed to clients.
- Bindings receive short-lived credentials bounded by their provider
  installation.
- Installation authorization is reusable without copying runtime tokens between
  projects.
- Provider differences live behind issuance strategies rather than a false
  assumption that every provider implements OAuth the same way.

### Negative

- Hem now operates security-sensitive hosted infrastructure.
- The CLI requires network access to issue managed credentials.
- User authentication, authorization, secret storage, auditing, and operational
  availability become product responsibilities.
- Offline operation requires a future, explicit policy rather than falling back
  silently to durable credentials.

## Alternatives considered

### Distribute the GitHub App private key with the CLI

Rejected. Extracting one distributed key would compromise every Hem-managed
GitHub installation.

### Require every user to create a GitHub App

Rejected as the default managed experience. It may later be supported as a
customer-managed connector.

### Use only GitHub user OAuth tokens

Rejected as the foundational model. User OAuth is useful for user identity and
user-context operations, but it does not provide the same installation-level
repository policy and server-side re-minting lifecycle.

### Proxy all provider API traffic through Hem

Rejected. Hem should issue credentials and enforce their authorization boundary,
not become a universal API gateway.
