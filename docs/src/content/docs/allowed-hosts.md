---
title: Allowed hosts
description: MLflow's security middleware, the Host header, and the secret this chart computes.
---

MLflow 3.x validates the `Host` header of every incoming request against an allow-list.
The point is to block **DNS rebinding**: an attacker's domain resolving to an internal
address so a victim's browser makes requests to an internal MLflow with the attacker's
origin. Checking the `Host` header means MLflow rejects anything that did not arrive under
a name it expects.

The list is `MLFLOW_SERVER_ALLOWED_HOSTS`, and this chart computes it for you.

## What the chart computes

The `nebari-mlflow-allowed-hosts` Secret holds a comma-separated list built from:

1. `nebariapp.hostname` — when `nebariapp.enabled` is true and a hostname is set
2. `<release>.<namespace>.svc.cluster.local` — the in-cluster DNS name
3. everything in `security.additionalAllowedHosts`

For a release `mlflow-pack` in namespace `mlflow` with hostname `mlflow.example.com`:

```
mlflow.example.com,mlflow-pack.mlflow.svc.cluster.local
```

Entries are compared against the `Host` header **exactly**, unless an entry contains `*`, in
which case it is matched as a glob. Two consequences worth knowing: a name that reaches
MLflow on a non-default port needs the port in the entry (`localhost:5000`, or
`localhost:*`), and setting this list *replaces* MLflow's built-in defaults, which would
otherwise have allowed localhost and the RFC 1918 ranges.

The Secret is injected via the subchart's `extraSecretNamesForEnvFrom`, so the value
reaches the container as an environment variable without a template edit.

Those two entries are exactly the two supported access paths: browsers through the gateway,
and notebooks over the cluster network. See [Connecting JupyterHub](/jupyterhub/).

## Adding hosts

```yaml
security:
  additionalAllowedHosts:
    - custom-alias.internal
    - mlflow.internal.example.com
```

Cases that need it:

- A second hostname routed to the same service.
- A short-form in-cluster name — `mlflow-pack.mlflow` or bare `mlflow-pack` — used by a
  client that does not write the FQDN.
- `localhost:*`, when reaching MLflow through `kubectl port-forward` — the client sends
  `localhost:<port>`, so a bare `localhost` entry never matches.

## Inspecting the current value

```bash
kubectl -n mlflow get secret nebari-mlflow-allowed-hosts \
  -o jsonpath='{.data.MLFLOW_SERVER_ALLOWED_HOSTS}' | base64 -d; echo
```

Or from inside the running container:

```bash
kubectl -n mlflow exec deploy/mlflow-pack -- env | grep ALLOWED_HOSTS
```

## Symptoms of a rejected host

The request fails before MLflow's application logic runs. The server answers **403** with a
plain-text body — `Invalid Host header - possible DNS rebinding attack detected` — which the
MLflow Python client usually surfaces as a confusing parse or connection error rather than as
an auth failure. The server log names the rejected host, which is the fastest way to confirm:

```bash
kubectl -n mlflow logs deploy/mlflow-pack | grep -i "invalid Host header"
```

Compare what the log reports against the computed list. The value in the log is the exact
string to add to `additionalAllowedHosts`.

`/health` and `/version` are exempt from the check. That is why the readiness probe stays
green through a host-list problem — and why a passing health check tells you nothing about
whether the list is right.

## Why the chart runs uvicorn, not gunicorn

```yaml
mlflow:
  log:
    enabled: false
```

That looks unrelated, and it is not. `log.enabled: true` makes the upstream chart pass
`--gunicorn-opts` to `mlflow server`, and MLflow reads *any* `--gunicorn-opts` as "run under
gunicorn instead of uvicorn". MLflow documents its security middleware — host validation,
CORS, and the `--allowed-hosts` / `--disable-security-middleware` switches — as unavailable
under `--gunicorn-opts` or `--waitress-opts`. Turning logging on silently disables the
mechanism this page describes.

Uvicorn logs at info level by default, so the practical loss is small — but it is not
nothing. `log.enabled: false` also makes the upstream chart set
`MLFLOW_CONFIGURE_LOGGING=false` and omit `MLFLOW_LOGGING_LEVEL`, so MLflow no longer
configures its own logging handlers.

:::caution[Do not enable `mlflow.log`]
It is not a logging toggle in practice — it is a server-implementation toggle, and the
other implementation cannot accept the security-middleware flags.
:::

## Disabling the middleware

MLflow supports `--disable-security-middleware`. This chart does not expose it, and turning
it on means accepting requests under any `Host` header. If a legitimate host is being
rejected, add it to `additionalAllowedHosts` rather than disabling the check.
