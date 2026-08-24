---
title: Introduction
description: "MLflow experiment tracking and model registry with Keycloak authentication, a PostgreSQL backend, and automatic TLS."
---

The Nebari MLflow Pack deploys [MLflow](https://mlflow.org/) on a
[Nebari](https://nebari.dev) cluster: experiment tracking and a model registry behind
Keycloak SSO, with a PostgreSQL backend store and TLS provisioned for you.

It wraps the [community MLflow chart](https://github.com/community-charts/helm-charts/tree/main/charts/mlflow)
and adds three things that chart cannot know about: a `NebariApp` for routing and auth, a
`MLFLOW_SERVER_ALLOWED_HOSTS` secret derived from that hostname, and defaults chosen so the
combination actually works.

```
  browser ──► Envoy Gateway ──► MLflow ──► PostgreSQL
                   │          svc :80         (bundled)
              OIDC filter    pod :5000
                   │
               Keycloak

  JupyterHub notebooks ──────► MLflow  (in-cluster, no auth hop)
    MLFLOW_TRACKING_URI       svc :80
```

Two ways in, deliberately. Humans arrive through the gateway and authenticate against
Keycloak; notebooks talk to the ClusterIP service directly, bypassing the OIDC filter
because the MLflow Python client has no way through it. See
[Connecting JupyterHub](/jupyterhub/).

## What ships

- **MLflow 3.7.0**, served by uvicorn so the 3.x security-middleware flags are available.
- **PostgreSQL 17.5** as the backend store, with an 8Gi PVC and schema migration on
  startup. On by default — the alternative is SQLite that loses every experiment on pod
  restart.
- **A `NebariApp`** producing an HTTPRoute, a cert-manager certificate, a Keycloak client,
  and an Envoy `SecurityPolicy` enforcing OIDC at the gateway.
- **An allowed-hosts Secret** computed from the NebariApp hostname plus the in-cluster
  service DNS name, injected via `envFrom`.

## Know this before you deploy

Two defaults surprise people, and both are covered in full below.

- **Artifacts are ephemeral out of the box.** The backend store is durable; the artifact
  store defaults to a path inside the pod's filesystem, so logged models and files vanish
  on restart. See [Artifact storage](/artifact-storage/).
- **The PostgreSQL secret must exist first**, and its name must be exactly
  `<release-name>-postgresql`. See [Getting started](/getting-started/).

## In this guide

- **[Getting started](/getting-started/)** — the credentials secret, install, first check
- **[Deploying on Nebari](/deployment/)** — the Argo CD `Application`, DNS, and certificates
- **[Connecting JupyterHub](/jupyterhub/)** — tracking URI, the NetworkPolicy port trap,
  and verifying from a notebook
- **[Standalone deployment](/standalone/)** — running without Nebari, and locally

## Guides

- **[PostgreSQL backend](/postgresql/)** — the secret contract, sizing, and the SQLite
  fallback
- **[Artifact storage](/artifact-storage/)** — why the default is ephemeral, and how to
  point it at a bucket
- **[Allowed hosts](/allowed-hosts/)** — MLflow's security middleware and the Host header
- **[Troubleshooting](/troubleshooting/)** — symptoms, causes, and the commands that
  distinguish them

## Reference

- **[Configuration](/configuration/)** — every value this chart owns
- **[Authentication flow](/auth-flow/)** — the OIDC handshake, cookie format, and JWT claims
- **[NebariApp CRD](/nebariapp-crd-reference/)** — field-by-field reference
