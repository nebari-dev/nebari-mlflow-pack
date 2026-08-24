---
title: Troubleshooting
description: Symptoms, causes, and the commands that tell them apart.
---

## First look

```bash
kubectl -n mlflow get pods
kubectl -n mlflow get nebariapp,httproute
kubectl -n envoy-gateway-system get certificate -l nebari.dev/nebariapp-namespace=mlflow
kubectl -n mlflow logs deploy/mlflow-pack --tail=100
```

## The NebariApp is not ready

```bash
kubectl -n mlflow describe nebariapp
```

The resource is named `<release>-<chart>` — `mlflow-pack-nebari-mlflow-pack` for a release
called `mlflow-pack` — which is why the commands on this page address it by namespace rather
than by name wherever they can.

`RoutingReady`, `TLSReady`, and `AuthReady` should all be `True`. Each maps to a different
cause.

| Condition | Usually means |
|---|---|
| `RoutingReady: False` | The target service does not exist, or the gateway has no listener for the hostname. |
| `TLSReady: False` | Reason `CertificateNotReady`: cert-manager has not issued it — check DNS and the ACME challenge. Reason `ClusterIssuerNotConfigured`: the operator has no ClusterIssuer, so the app fell back to the gateway's shared HTTPS listener. |
| `AuthReady: False` | The operator could not reach Keycloak, or the realm/hostname is wrong. |

**Nothing happens at all** — no conditions, no events — almost always means the namespace is
not opted in:

```bash
kubectl get namespace mlflow -o jsonpath='{.metadata.labels}'
# needs nebari.dev/managed=true
```

The operator ignores `NebariApp` resources in unlabeled namespaces, silently.

## The service name does not match

```bash
kubectl -n mlflow get svc
kubectl -n mlflow get nebariapp -o jsonpath='{.items[0].spec.service.name}'
```

The community chart names the service after the **release**, not `<release>-mlflow`,
because its fullname helper collapses when the release name contains the chart name. Both
this chart's `mlflow-service-name` helper and the `NebariApp` default follow the same rule,
so they agree — unless you overrode `nebariapp.service.name`, `nameOverride`, or
`fullnameOverride`. If routing is broken right after such an override, compare the two
outputs above.

## PostgreSQL crash-loops

```bash
kubectl -n mlflow logs statefulset/mlflow-pack-postgresql --tail=50
```

| Log says | Cause |
|---|---|
| A key is missing from the secret | The Secret lacks `password` or `postgres-password`. The pod sits in `CreateContainerConfigError` rather than crash-looping. |
| Authentication failed for user `mlflow` | The Secret name is not `<release>-postgresql`. MLflow's `PGPASSWORD` reference points at that exact name and is `optional: true`, so it starts with no password at all. |
| Pending PVC | No default StorageClass, or the requested class does not exist. |

Check the secret is where the chart looks for it:

```bash
kubectl -n mlflow get secret mlflow-pack-postgresql -o jsonpath='{.data}' | jq 'keys'
# ["password","postgres-password"]
```

See [PostgreSQL backend](/postgresql/).

## MLflow starts but returns 403s

Almost always the `Host` header check. The response body is
`Invalid Host header - possible DNS rebinding attack detected`:

```bash
kubectl -n mlflow logs deploy/mlflow-pack | grep -i "invalid Host header"
kubectl -n mlflow get secret nebari-mlflow-allowed-hosts \
  -o jsonpath='{.data.MLFLOW_SERVER_ALLOWED_HOSTS}' | base64 -d; echo
```

The rejected host in the log is the exact string to add to
`security.additionalAllowedHosts` — port included, if the client sent one, because the
comparison is exact. `/health` and `/version` are exempt from the check, so the readiness
probe stays green throughout. See [Allowed hosts](/allowed-hosts/).

If `MLFLOW_SERVER_ALLOWED_HOSTS` is missing from the container environment entirely, check
that `mlflow.extraSecretNamesForEnvFrom` still contains `nebari-mlflow-allowed-hosts` — an
override that replaces the list rather than appending to it drops the injection.

## Notebooks time out reaching MLflow

The NetworkPolicy port. The tracking URI uses the service port (**80**); the egress rule
must use the pod port (**5000**), because NetworkPolicy is enforced after the ClusterIP
translation.

```bash
kubectl -n jupyterhub get networkpolicy -o yaml | grep -A5 egress
```

Then confirm the environment actually reached the pod:

```python
import os; print(os.environ.get("MLFLOW_TRACKING_URI"))
```

Empty means the server predates the change — restart it from the hub control panel. See
[Connecting JupyterHub](/jupyterhub/).

## Runs exist but the model files are gone

Expected with the default configuration. Run metadata lives in PostgreSQL and survives;
artifacts default to a path inside the pod and do not.

```bash
kubectl -n mlflow get deploy mlflow-pack \
  -o jsonpath='{.spec.template.spec.containers[0].args}'
```

The artifact root is a server flag, not an environment variable.
`--default-artifact-root=./mlruns` confirms it; a configured bucket appears instead as
`--artifacts-destination=s3://…` alongside `--serve-artifacts`. See
[Artifact storage](/artifact-storage/).

## The browser loops through Keycloak

A redirect loop between MLflow and Keycloak usually means a redirect-URI mismatch. The
operator registers `https://<hostname><redirectURI>`; the default `redirectURI` is
`/oauth2/callback`. If either the hostname or that path was changed on one side only, the
loop follows.

```bash
kubectl -n mlflow get nebariapp -o jsonpath='{.items[0].spec.auth}' | jq
kubectl -n mlflow get secret mlflow-pack-nebari-mlflow-pack-oidc-client
```

Also check cookie size: a user in many Keycloak groups can produce a JWT that exceeds the
~4KB browser cookie limit, which presents as a loop rather than an error. See
[Authentication flow](/auth-flow/#limitations).

## Health check

The definitive "is the server itself alive" test, bypassing gateway, TLS, and auth:

```bash
kubectl -n mlflow port-forward svc/mlflow-pack 5080:80 &
curl -sf http://localhost:5080/health && echo OK
kill %1
```

A pass here narrows every remaining problem to routing, TLS, auth, or the client.

## Gathering state for an issue

```bash
kubectl -n mlflow get all
kubectl -n mlflow describe nebariapp
kubectl -n mlflow logs deploy/mlflow-pack --tail=200
kubectl -n mlflow logs statefulset/mlflow-pack-postgresql --tail=100
kubectl -n mlflow get events --sort-by=.lastTimestamp | tail -30
helm -n mlflow get values mlflow-pack
```

Redact the values output before sharing — it can contain an inline password.
