---
title: Standalone deployment
description: Running the pack without Nebari — no operator, gateway, or Keycloak.
---

The Nebari integration is optional. With `nebariapp.enabled: false` the chart renders no
`NebariApp`, so it needs no operator, no Envoy Gateway, no cert-manager, and no Keycloak —
just MLflow and its backend store.

## Minimal install

[`examples/standalone-values.yaml`](https://github.com/nebari-dev/mlflow-pack/blob/main/examples/standalone-values.yaml):

```yaml
nebariapp:
  enabled: false

mlflow:
  postgresql:
    enabled: false   # in-memory SQLite; data lost on restart
```

```bash
helm install mlflow-pack nebari-mlflow-pack/nebari-mlflow-pack \
  --namespace mlflow --create-namespace \
  -f standalone-values.yaml
```

Then:

```bash
kubectl -n mlflow port-forward svc/mlflow-pack 5000:80
```

Open `http://localhost:5000`.

:::caution[The example is for evaluation only]
It disables PostgreSQL, so every experiment is lost on pod restart, and artifacts are
ephemeral too. It exists to get MLflow in front of you in one command.
:::

## Standalone but durable

Drop the SQLite line and keep the backend store:

```yaml
nebariapp:
  enabled: false

mlflow:
  postgresql:
    enabled: true
    auth:
      existingSecret: mlflow-pack-postgresql
    primary:
      persistence:
        size: 8Gi
```

with the credentials secret created first, per
[PostgreSQL backend](/postgresql/#the-credentials-secret). Configure
[artifact storage](/artifact-storage/) too, or logged models remain ephemeral.

## Access without a gateway

Three options, in increasing order of permanence.

**Port-forward** — fine for one person:

```bash
kubectl -n mlflow port-forward svc/mlflow-pack 5000:80
```

If MLflow rejects the request, add `localhost` to the allow-list. The comparison is exact,
so the entry has to carry the port the client sends — `localhost:*` covers any
port-forward:

```yaml
security:
  additionalAllowedHosts:
    - "localhost:*"
```

**Your own Ingress** — the chart does not render one, so use the subchart's `ingress`
block, and add the hostname to `security.additionalAllowedHosts` since there is no
`nebariapp.hostname` to derive it from.

**A LoadBalancer service:**

```yaml
mlflow:
  service:
    type: LoadBalancer
```

## Authentication without Keycloak

Nothing in this configuration authenticates anyone. Anybody who can reach the service has
full read/write access to every experiment and the model registry.

The upstream chart offers MLflow's own basic auth and LDAP auth
(`mlflow.auth` and `mlflow.ldapAuth`, mutually exclusive). Both are subchart features that
this pack neither configures nor tests — check the
[community chart documentation](https://github.com/community-charts/helm-charts/tree/main/charts/mlflow)
before relying on either.

For a shared deployment, the Nebari path is the supported one:
[Deploying on Nebari](/deployment/).

## Local development

The chart runs on kind or k3d with the standalone values. What that does *not* exercise is
the `NebariApp` — no routing, no TLS, no OIDC — so it cannot catch a hostname or auth
misconfiguration.

To test the full path locally you need the platform stack the operator expects: MetalLB,
Envoy Gateway, cert-manager, Keycloak, and the operator itself. The repository's
`test-integration.yaml` workflow builds exactly that on a kind cluster using the
nebari-operator's `dev/scripts/services/install.sh`, and is the accurate reference for the
sequence.

:::note[`dev/Makefile` is not for this pack]
The `dev/Makefile` in the repository was inherited from the software-pack template. Its
targets point at example charts (`../examples/vanilla-yaml`, `../examples/basic-nginx`)
that do not exist here. Use the integration workflow as the reference instead.
:::

## What CI verifies

`test.yaml` runs on every push and pull request: a kind cluster, `helm template` with
`nebariapp.enabled=false` and `postgresql.enabled=false`, then a rollout wait, a
`GET /health` through a port-forward, a re-apply, and the health check again.

That covers the standalone path and upgrade-in-place. `test-integration.yaml` goes further:
it stands up MetalLB, Envoy Gateway, cert-manager, Keycloak, and the operator on kind, then
waits for the `NebariApp` to report `Ready` and checks the `HTTPRoute` exists. It deploys
with `nebariapp.auth.enabled=false`, though, so the OIDC handshake itself is not exercised
by CI.
