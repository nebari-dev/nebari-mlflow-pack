---
title: Deploying on Nebari
description: The Argo CD Application, DNS, certificates, and sync ordering.
---

On a GitOps-managed Nebari cluster the pack is deployed as an Argo CD `Application`. A
complete manifest lives in
[`examples/nebari-values.yaml`](https://github.com/nebari-dev/mlflow-pack/blob/main/examples/nebari-values.yaml).

## Before Argo CD

Two things must exist first, and neither belongs in the Application:

1. **The namespace and its PostgreSQL secret.** The secret holds credentials, so it does
   not go in a values block that lands in git. Create it out of band, or with a sealed/
   external-secrets mechanism your cluster already uses. See
   [Getting started](/getting-started/#1-create-the-postgresql-credentials-secret).
2. **DNS** for `mlflow.<your-domain>`, pointing at the gateway's external address. The
   certificate is provisioned for you — see [Certificates and DNS](#certificates-and-dns).

## The manifest

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: mlflow-pack
  namespace: argocd
  labels:
    app.kubernetes.io/part-of: nebari-packs
    app.kubernetes.io/managed-by: nebari-infrastructure-core
  annotations:
    argocd.argoproj.io/sync-wave: "6"
  finalizers:
    - resources-finalizer.argocd.argoproj.io
spec:
  project: default

  source:
    chart: nebari-mlflow-pack
    repoURL: https://nebari-dev.github.io/nebari-mlflow-pack
    targetRevision: 1.0.0
    helm:
      releaseName: mlflow-pack
      values: |
        nebariapp:
          hostname: mlflow.example.nebari.dev
          keycloakHostname: keycloak.example.nebari.dev
          auth:
            enabled: true
            provider: keycloak
            provisionClient: true
        mlflow:
          postgresql:
            auth:
              existingSecret: mlflow-pack-postgresql
            primary:
              persistence:
                storageClass: ""      # your cluster's class

  destination:
    server: https://kubernetes.default.svc
    namespace: mlflow

  syncPolicy:
    managedNamespaceMetadata:
      labels:
        nebari.dev/managed: "true"
    automated:
      prune: true
      selfHeal: true
      allowEmpty: false
    syncOptions:
      - CreateNamespace=true
      - ServerSideApply=true
    retry:
      limit: 5
      backoff: { duration: 5s, factor: 2, maxDuration: 3m }
```

Copy it into your GitOps repository, replace the two hostnames and the storage class, and
commit.

## What each part is doing

**`releaseName: mlflow-pack`** is load-bearing twice over. It determines the PostgreSQL
secret name the chart looks for (`<release>-postgresql`) and the MLflow service name the
`NebariApp` targets. Changing it means changing the secret name to match.

**`managedNamespaceMetadata`** labels the namespace `nebari.dev/managed: "true"`. The
nebari-operator ignores `NebariApp` resources in unlabeled namespaces, so without this the
resource is created and then nothing happens.

**`CreateNamespace=true`** is what makes `managedNamespaceMetadata` take effect. If you
pre-created the namespace for the secret, Argo CD still applies the label on sync.

**`sync-wave: "6"`** orders MLflow after the platform services it depends on — the
operator, gateway, cert-manager, and Keycloak. Waves are relative; match whatever your
cluster uses.

**`selfHeal: true`** reverts manual edits. Change values in git, not with `kubectl edit`.

**`targetRevision`** should stay pinned. A floating version would upgrade MLflow and its
database schema without warning.

**`keycloakHostname`** and **`keycloakRealm`** are inert. They appear in `values.yaml` and
in the example manifest, but no template reads them and the `NebariApp` CRD has no matching
fields — the operator learns how to reach Keycloak from its own cluster-wide configuration.
Setting them changes nothing, and so does leaving them out.

## Certificates and DNS

The `NebariApp` asks cert-manager for a certificate covering the hostname, and asks the
gateway to route it. Two independent things can be missing.

The `Certificate` does **not** live in the release namespace. The operator creates it in
`envoy-gateway-system`, alongside the gateway, named `<nebariapp-name>-<namespace>-cert`
and labelled with the app it belongs to:

```bash
# Is the certificate issued?
kubectl -n envoy-gateway-system get certificate \
  -l nebari.dev/nebariapp-namespace=mlflow
kubectl -n envoy-gateway-system describe certificate \
  mlflow-pack-nebari-mlflow-pack-mlflow-cert

# Does the route exist and is it attached to a listener?
kubectl -n mlflow get httproute -o wide
```

A pending certificate usually means the ACME challenge cannot resolve the hostname — DNS
first, then the certificate.

If the operator has no ClusterIssuer configured it skips this path entirely, falls back to
the gateway's shared HTTPS listener, and reports `TLSReady: False` with reason
`ClusterIssuerNotConfigured`. That is the one case where the hostname has to be covered by
a certificate someone else maintains.

## Keycloak client

With `auth.provisionClient: true`, the operator creates a confidential OIDC client in the
realm and writes its credentials to `<nebariapp-name>-oidc-client`:

```bash
kubectl -n mlflow get secret mlflow-pack-nebari-mlflow-pack-oidc-client
```

The redirect URI is `https://<hostname>/oauth2/callback`, matching the chart's
`auth.redirectURI` default. The full handshake is described in
[Authentication flow](/auth-flow/).

To bring your own client instead, set `provisionClient: false` and supply
`auth.clientSecretRef`.

## Restricting access to groups

By default any authenticated realm user reaches MLflow. To restrict it, name the groups:

```yaml
nebariapp:
  auth:
    groups: [data-science-team]
    keycloakConfig:
      groups:
        - name: data-science-team
          members: [alice, bob]
```

The gateway then admits only members of the listed groups.

## Upgrading

Bump `targetRevision` and commit.

:::caution[Database migrations run on upgrade]
`backendStore.databaseMigration: true` means the MLflow pod migrates the schema at startup.
Migrations are one-way — rolling the chart back to an older MLflow does not roll the schema
back. Snapshot the PostgreSQL volume before a major MLflow version bump.
:::

## Verifying a sync

```bash
kubectl -n argocd get application mlflow-pack
argocd app get mlflow-pack

kubectl get namespace mlflow -o jsonpath='{.metadata.labels}'
kubectl -n mlflow get nebariapp,httproute
kubectl -n envoy-gateway-system get certificate -l nebari.dev/nebariapp-namespace=mlflow
```
