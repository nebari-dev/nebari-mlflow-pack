---
title: Connecting JupyterHub
description: Let notebooks log experiments to MLflow — tracking URI, NetworkPolicy, and verification.
---

Notebooks in
[nebari-data-science-pack](https://github.com/nebari-dev/nebari-data-science-pack) reach
MLflow over the cluster network, not through the gateway. Two things are needed: the
tracking URI in the environment, and a NetworkPolicy egress rule that permits the
connection.

## Configuration

Add to your data-science-pack Argo CD Application values:

```yaml
jupyterhub:
  singleuser:
    extraEnv:
      MLFLOW_TRACKING_URI: "http://mlflow-pack.mlflow.svc.cluster.local:80"
    networkPolicy:
      egress:
        - ports:
            - port: 5000
              protocol: TCP
          to:
            - namespaceSelector:
                matchLabels:
                  kubernetes.io/metadata.name: mlflow
```

Adjust `mlflow-pack` and `mlflow` if your release name or namespace differ. The service
name is the **release name** — see [Getting started](/getting-started/#what-gets-deployed).

:::caution[The two port numbers are different on purpose]
The tracking URI uses **80**, the service port. The NetworkPolicy uses **5000**, the pod
port. NetworkPolicy is enforced at the pod IP level, after kube-proxy has already
translated the ClusterIP's 80 to the container's 5000 — so a rule written against port 80
matches nothing and every connection times out.
:::

That mismatch is the single most common reason this integration silently fails.

## Restart existing sessions

Running JupyterLab servers do not pick up either change. Users must stop and start their
server from the hub control panel. A pod that predates the NetworkPolicy keeps the old
rules.

## Verify from a notebook

```python
import mlflow

mlflow.set_experiment("test")
with mlflow.start_run():
    mlflow.log_param("framework", "pytorch")
    mlflow.log_metric("accuracy", 0.95)

print("Run ID:", mlflow.last_active_run().info.run_id)
```

The run should appear in the MLflow UI under the `test` experiment. If the call hangs and
eventually times out, it is almost always the NetworkPolicy port.

Confirm the environment first:

```python
import os
print(os.environ.get("MLFLOW_TRACKING_URI"))
```

Empty means the pod started before `extraEnv` was applied — restart the server.

## Why notebooks bypass the gateway

The gateway path is protected by an Envoy OIDC filter that expects a browser: it redirects
unauthenticated requests to Keycloak and stores tokens in cookies. The MLflow Python client
speaks HTTP with no cookie jar and no interactive login, so pointing
`MLFLOW_TRACKING_URI` at `https://mlflow.example.com` gets a 302 to a login page that the
client cannot follow — usually surfacing as a confusing parse error rather than an auth
error.

Going straight to the ClusterIP avoids the filter entirely. The trade-off is explicit:

:::caution[In-cluster access is unauthenticated]
Any pod allowed by NetworkPolicy to reach the MLflow service can read and write every
experiment, with no identity attached. Access control is the NetworkPolicy, so scope the
egress rule to the namespaces that genuinely need it.
:::

The allowed-hosts middleware does not change this — it validates the `Host` header against
a list that already includes the in-cluster DNS name. See [Allowed hosts](/allowed-hosts/).

## Artifacts from notebooks

`mlflow.log_artifact()` and `mlflow.sklearn.log_model()` upload through the tracking server
to the artifact store. With the default configuration that store is a directory inside the
MLflow pod, so **artifacts logged from notebooks are lost when the pod restarts** even
though the run metadata in PostgreSQL survives — leaving runs that reference models which
no longer exist.

Configure a bucket before people start logging models. See
[Artifact storage](/artifact-storage/).

## Connecting from elsewhere in the cluster

The same pattern works for any workload: set `MLFLOW_TRACKING_URI` to
`http://<release>.<namespace>.svc.cluster.local:80` and allow egress to pod port 5000. For
a client outside the cluster, port-forward:

```bash
kubectl -n mlflow port-forward svc/mlflow-pack 5000:80
export MLFLOW_TRACKING_URI=http://localhost:5000
```

`localhost` is not in the allowed-hosts list by default, so add it if the server rejects
the request. The port has to match too — MLflow compares the `Host` header exactly, and a
port-forwarded client sends `localhost:5000`:

```yaml
security:
  additionalAllowedHosts:
    - "localhost:*"
```
