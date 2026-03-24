# Nebari MLflow Pack

Deploys [MLflow](https://mlflow.org/) on [Nebari](https://nebari.dev) with
Keycloak authentication, PostgreSQL backend storage, and automatic TLS.

## Quick Start

1. **Create the PostgreSQL credentials secret:**

   ```bash
   kubectl create namespace mlflow

   kubectl create secret generic mlflow-pack-postgresql \
     --namespace mlflow \
     --from-literal=password="$(openssl rand -base64 32)" \
     --from-literal=postgres-password="$(openssl rand -base64 32)"
   ```

2. **Copy the example ArgoCD Application and edit it for your cluster:**

   ```bash
   cp examples/argocd-application.yaml /path/to/your/gitops-repo/apps/mlflow-pack.yaml
   ```

   Update `nebariapp.hostname`, `nebariapp.keycloakHostname`, and
   `mlflow.postgresql.primary.persistence.storageClass` for your environment.

3. **Add `mlflow.<your-domain>` to your gateway certificate and DNS.**

4. **Connect JupyterHub** (if using
   [nebari-data-science-pack](https://github.com/nebari-dev/nebari-data-science-pack)):

   Add the following to your data-science-pack ArgoCD Application values:

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

See [examples/argocd-application.yaml](examples/argocd-application.yaml) for
the full ArgoCD Application manifest.

## PostgreSQL Backend Store

By default, this chart bundles a Bitnami PostgreSQL instance for persistent
experiment and run storage. The database credentials must be provided via a
pre-created Kubernetes Secret.

### Creating the credentials secret

The secret name **must** follow the convention `<release-name>-postgresql`. For
example, if your Helm release name is `mlflow-pack`, the secret must be named
`mlflow-pack-postgresql`.

```bash
kubectl create namespace mlflow  # if it doesn't exist

# Replace "mlflow-pack" with your Helm release name
kubectl create secret generic mlflow-pack-postgresql \
  --namespace mlflow \
  --from-literal=password="$(openssl rand -base64 32)" \
  --from-literal=postgres-password="$(openssl rand -base64 32)"
```

| Key                 | Purpose                              |
|---------------------|--------------------------------------|
| `password`          | Password for the `mlflow` database user |
| `postgres-password` | Password for the PostgreSQL superuser   |

### Referencing the secret

In your ArgoCD Application values (or `helm install --set`):

```yaml
mlflow:
  postgresql:
    auth:
      existingSecret: mlflow-pack-postgresql  # must be <release>-postgresql
```

### Alternative: inline password (dev/testing only)

For quick development setups, you can pass the password directly:

```bash
helm install mlflow-pack . \
  --set mlflow.postgresql.auth.password=my-dev-password
```

This stores the password in the Helm release secret. **Do not use this in
production or commit it to a gitops repository.**

### Disabling PostgreSQL

To use in-memory SQLite (data lost on pod restart):

```yaml
mlflow:
  postgresql:
    enabled: false
```

## Connecting JupyterHub (data-science-pack)

To allow JupyterHub notebooks to log experiments to MLflow, add the following
to your [nebari-data-science-pack](https://github.com/nebari-dev/nebari-data-science-pack)
values:

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

This sets the tracking URI so the MLflow Python client auto-connects, and opens
the singleuser NetworkPolicy to allow traffic to the MLflow namespace. The
egress rule uses port **5000** (the pod port) because NetworkPolicy operates at
the pod IP level, not the ClusterIP service level (which maps 80→5000).

> **Note:** After applying, existing JupyterLab sessions must be restarted
> (stop/start from the hub control panel) to pick up the new NetworkPolicy.

### Verify from a notebook

```python
import mlflow
mlflow.set_experiment("test")
with mlflow.start_run():
    mlflow.log_param("framework", "pytorch")
    mlflow.log_metric("accuracy", 0.95)
print("Run ID:", mlflow.last_active_run().info.run_id)
```

## Troubleshooting

### NebariApp not ready

```bash
kubectl get nebariapp -n mlflow
kubectl describe nebariapp -n mlflow
```

Check conditions: `RoutingReady`, `TLSReady`, `AuthReady` should all be `True`.

### MLflow rejecting requests (host header)

If you see "Invalid Host header" errors, add `--disable-security-middleware`
via the chart values:

```yaml
mlflow:
  extraFlags:
    - disableSecurityMiddleware
```

This is safe when MLflow is behind Keycloak authentication at the gateway.

## License

Apache 2.0 - see [LICENSE](LICENSE).
