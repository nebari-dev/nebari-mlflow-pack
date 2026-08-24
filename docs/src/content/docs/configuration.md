---
title: Configuration
description: Values reference for the Nebari MLflow Pack Helm chart.
---

The chart owns three value trees — `nebariapp`, `security`, and the name overrides —
and passes everything under `mlflow` to the
[community MLflow chart](https://github.com/community-charts/helm-charts/tree/main/charts/mlflow)
(version 1.8.1).

| Key | Owner |
|---|---|
| `nebariapp.*` | this chart |
| `security.*` | this chart |
| `nameOverride`, `fullnameOverride` | this chart |
| `mlflow.*` | the `mlflow` subchart |

## `nebariapp`

| Value | Default | Purpose |
|---|---|---|
| `nebariapp.enabled` | `true` | Render the `NebariApp`. False for [standalone](/standalone/). |
| `nebariapp.hostname` | — | **Required when enabled.** External hostname. |
| `nebariapp.keycloakHostname` | — | **Unused** — see the note below. |
| `nebariapp.keycloakRealm` | `nebari` | **Unused** — see the note below. |
| `nebariapp.service.name` | `<release>` | Backend service — see the note below. |
| `nebariapp.service.port` | `80` | Backend port (container port is 5000). |
| `nebariapp.routing.routes` | `[{pathPrefix: /}]` | MLflow owns the whole host. |

:::note[The service is named after the release]
Not `<release>-mlflow`. The community chart's fullname helper collapses when the release
name contains the chart name, and this chart's `mlflow-service-name` helper matches that
behaviour so the `NebariApp` always targets the right service.

The `NebariApp` itself does *not* collapse, because the release name `mlflow-pack` does not
contain the chart name `nebari-mlflow-pack` — so it is called
`mlflow-pack-nebari-mlflow-pack`, and every resource the operator derives from it inherits
that name.
:::

:::caution[`keycloakHostname` and `keycloakRealm` do nothing]
Both appear in `values.yaml` and in `examples/nebari-values.yaml`, but no template reads
them and the `NebariApp` CRD has no matching fields — the operator gets its Keycloak
endpoint and realm from its own cluster-wide configuration. Setting them has no effect, and
neither does leaving them out.
:::

### `nebariapp.auth`

| Value | Default | Purpose |
|---|---|---|
| `auth.enabled` | `true` | Provision a Keycloak client and enforce OIDC. |
| `auth.provider` | `keycloak` | Identity provider. |
| `auth.provisionClient` | `true` | Let the operator create the client. False + `clientSecretRef` to bring your own. |
| `auth.enforceAtGateway` | `true` | Envoy enforces OIDC in front of MLflow. |
| `auth.redirectURI` | `/oauth2/callback` | Where Keycloak sends the authorization code. |
| `auth.scopes` | `openid, profile, email, groups` | Requested scopes. |
| `auth.groups` | unset | Groups created in Keycloak; restricts access when set. |
| `auth.keycloakConfig` | unset | Group membership and protocol mappers. |

`enforceAtGateway: true` is right for MLflow — it has no OIDC support of its own, so the
gateway does the whole handshake and MLflow sees an already-authenticated request. (Compare
[lgtm-pack](https://packs.nebari.dev/lgtm-pack/), where Grafana runs its own flow and
gateway enforcement is off.)

The full handshake, cookie names, and JWT claims are in
[Authentication flow](/auth-flow/).

### `nebariapp.landingPage`

Not present in `values.yaml`, so no tile by default. The template passes through `enabled`,
`displayName`, `description`, `icon`, `category`, `priority`, `externalUrl`, and
`healthCheck` if you add it. (The CRD also has `iconLight`, `iconDark`, and
`healthCheck.port`; this chart's template drops those.)

```yaml
nebariapp:
  landingPage:
    enabled: true
    displayName: MLflow
    description: Experiment tracking and model registry
    category: "Machine Learning"
    healthCheck:
      enabled: true
      path: /health
```

Field semantics are in the [NebariApp CRD reference](/nebariapp-crd-reference/).

## `security`

| Value | Default | Purpose |
|---|---|---|
| `security.additionalAllowedHosts` | `[]` | Extra entries for `MLFLOW_SERVER_ALLOWED_HOSTS`. |

The NebariApp hostname and the in-cluster service DNS name are added automatically. See
[Allowed hosts](/allowed-hosts/).

## Subchart values this chart sets

Defaults worth understanding before you override them.

| Value | Set to | Why |
|---|---|---|
| `mlflow.image.tag` | `3.7.0` | Pinned to the chart's `appVersion`. |
| `mlflow.service.type` | `ClusterIP` | Routing is the `NebariApp`'s job. |
| `mlflow.log.enabled` | `false` | Keeps the server on uvicorn. Gunicorn cannot accept MLflow 3.x's security-middleware flags — see [Allowed hosts](/allowed-hosts/#why-the-chart-runs-uvicorn-not-gunicorn). |
| `mlflow.extraSecretNamesForEnvFrom` | `[nebari-mlflow-allowed-hosts]` | Injects the computed host list. |
| `mlflow.backendStore.databaseMigration` | `true` | Migrates the schema at startup. |
| `mlflow.backendStore.databaseConnectionCheck` | `true` | Waits for PostgreSQL before starting. |
| `mlflow.postgresql.enabled` | `true` | The default alternative is SQLite that loses everything on restart. |
| `mlflow.postgresql.image.tag` | `17.5.0` | Bundled PostgreSQL. |
| `mlflow.postgresql.auth.username` / `.database` | `mlflow` | — |
| `mlflow.postgresql.primary.persistence` | enabled, `8Gi` | Metadata only; models live in the artifact store. |

:::caution[Two subchart defaults this chart does *not* change]
`artifactRoot.defaultArtifactRoot` stays at the upstream `./mlruns`, a path inside the pod
— artifacts are ephemeral until you configure a bucket. And `mlflow.auth` (MLflow's own
basic auth) stays off, because the gateway handles authentication. See
[Artifact storage](/artifact-storage/).
:::

## Overrides

| Value | Default | Purpose |
|---|---|---|
| `nameOverride` | `""` | Overrides the chart name in labels and helpers. |
| `fullnameOverride` | `""` | Overrides the full name. |

Both change the `NebariApp` name, not the MLflow service name — the service comes from the
subchart's own helper. If you set either, re-check that
`nebariapp.service.name` still points at a service that exists.

## A production values file

```yaml
nebariapp:
  hostname: mlflow.example.com
  auth:
    groups: [data-science-team]

mlflow:
  postgresql:
    auth:
      existingSecret: mlflow-pack-postgresql
    primary:
      persistence:
        size: 20Gi
        storageClass: fast-ssd

  artifactRoot:
    proxiedArtifactStorage: true
    s3:
      enabled: true
      bucket: my-mlflow-artifacts
      existingSecret:
        name: mlflow-s3-credentials
        keyOfAccessKeyId: AWS_ACCESS_KEY_ID
        keyOfSecretAccessKey: AWS_SECRET_ACCESS_KEY

  resources:
    requests: { cpu: 250m, memory: 512Mi }
    limits: { memory: 2Gi }
```

## Inspecting

```bash
helm template mlflow-pack . --set nebariapp.hostname=mlflow.example.com | less
helm -n mlflow get values mlflow-pack          # what you overrode
helm -n mlflow get values mlflow-pack --all    # everything
```

Redact before sharing — the output can contain an inline password.
