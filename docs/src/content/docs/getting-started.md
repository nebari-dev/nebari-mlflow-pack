---
title: Getting started
description: Create the PostgreSQL secret, install the chart, and confirm MLflow is up.
---

## Prerequisites

- A Kubernetes cluster and Helm 3.
- For the full Nebari path: the
  [nebari-operator](https://github.com/nebari-dev/nebari-operator) (it provides the
  `NebariApp` CRD), Envoy Gateway, cert-manager with a cluster issuer, and a Keycloak realm.
- A StorageClass for the PostgreSQL PVC.

To try MLflow without any of the Nebari pieces, skip to
[Standalone deployment](/standalone/).

## 1. Create the PostgreSQL credentials secret

The bundled PostgreSQL reads its passwords from a Secret you create in advance.

```bash
kubectl create namespace mlflow

kubectl create secret generic mlflow-pack-postgresql \
  --namespace mlflow \
  --from-literal=password="$(openssl rand -base64 32)" \
  --from-literal=postgres-password="$(openssl rand -base64 32)"
```

:::caution[The name and keys are a contract, not a convention]
The Secret must be named **`<release-name>-postgresql`** — `mlflow-pack-postgresql` for a
release called `mlflow-pack` — and must contain exactly the keys `password` (the `mlflow`
database user) and `postgres-password` (the superuser). Get either wrong and the
PostgreSQL pod crash-loops on a key it cannot find.
:::

Then reference it:

```yaml
mlflow:
  postgresql:
    auth:
      existingSecret: mlflow-pack-postgresql
```

For a throwaway cluster you can skip the secret and pass the password inline —
`--set mlflow.postgresql.auth.password=dev-only` — but never in production or a GitOps
repository. More detail in [PostgreSQL backend](/postgresql/).

## 2. Install

```bash
helm install mlflow-pack . \
  --namespace mlflow \
  --set nebariapp.hostname=mlflow.example.com \
  --set mlflow.postgresql.auth.existingSecret=mlflow-pack-postgresql
```

On a GitOps cluster, use the Argo CD `Application` instead — see
[Deploying on Nebari](/deployment/).

:::caution[`hostname` is required]
With `nebariapp.enabled: true` (the default) and no `nebariapp.hostname`, the chart refuses
to render: `nebariapp.hostname is required when nebariapp.enabled is true`.
:::

## 3. Point DNS at the hostname

Add an `A` or `CNAME` record for `mlflow.<your-domain>` pointing at the gateway's external
address. The certificate is not your job: when the operator has a ClusterIssuer configured,
the `NebariApp` has cert-manager issue one for the hostname and adds a per-app HTTPS
listener to the gateway. Until DNS resolves, the ACME challenge cannot complete and
`TLSReady` stays `False` with reason `CertificateNotReady`.

If the operator has no ClusterIssuer, it falls back to the gateway's shared HTTPS listener
— and then the hostname does have to be covered by that shared certificate. To use a
certificate you manage yourself, set `nebariapp.routing.tls.secretName` to a
`kubernetes.io/tls` secret in `envoy-gateway-system`.

## What gets deployed

| Workload | Kind | Purpose |
|---|---|---|
| `mlflow-pack` | Deployment | MLflow server, container port `5000`, service port `80` |
| `mlflow-pack-postgresql` | StatefulSet | Backend store, 8Gi PVC |
| `nebari-mlflow-allowed-hosts` | Secret | `MLFLOW_SERVER_ALLOWED_HOSTS`, injected via `envFrom` |
| `mlflow-pack-nebari-mlflow-pack` | NebariApp | Routing, TLS, and Keycloak client |

Note the service is named after the **release**, not `<release>-mlflow` — the community
chart's fullname helper collapses when the release name contains the chart name. The
`nebariapp.service.name` default follows the same helper, so the two always agree.

The `NebariApp` gets the long name for the opposite reason: *this* chart's fullname helper
does not collapse, because the release name `mlflow-pack` does not contain the chart name
`nebari-mlflow-pack`, so the two are concatenated. Everything the operator derives inherits
it — the OIDC client secret is `mlflow-pack-nebari-mlflow-pack-oidc-client`, the certificate
is `mlflow-pack-nebari-mlflow-pack-mlflow-cert`. The commands in these docs leave the name
off wherever they can.

## Verify

```bash
kubectl -n mlflow get pods
kubectl -n mlflow rollout status deployment/mlflow-pack

# Health endpoint, straight at the pod. /health and /version are exempt from
# MLflow's Host-header check, so this answers even if the allowed-hosts list is wrong.
kubectl -n mlflow port-forward svc/mlflow-pack 5080:80 &
curl -sf http://localhost:5080/health && echo OK
kill %1
```

Then the routing layer:

```bash
kubectl -n mlflow get nebariapp
kubectl -n mlflow describe nebariapp
```

`RoutingReady`, `TLSReady`, and `AuthReady` should all be `True`. If they are not,
[Troubleshooting](/troubleshooting/) maps each one to its usual cause.

Open `https://mlflow.example.com`. Keycloak takes the login, then MLflow's UI loads.

## Next

- Wire up notebooks: [Connecting JupyterHub](/jupyterhub/)
- Make artifacts durable — the default is not:
  [Artifact storage](/artifact-storage/)
