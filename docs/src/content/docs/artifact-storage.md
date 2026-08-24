---
title: Artifact storage
description: Why logged models and files are ephemeral by default, and how to make them durable.
---

MLflow stores two different things in two different places:

| | Backend store | Artifact store |
|---|---|---|
| Holds | runs, params, metrics, tags, the model registry | model files, plots, datasets, anything `log_artifact` writes |
| This chart's default | bundled PostgreSQL with an 8Gi PVC | `./mlruns`, a path **inside the MLflow container** |
| Survives a pod restart | yes | **no** |

The backend store is configured for durability. The artifact store is not.

:::caution[Artifacts are lost when the MLflow pod restarts]
The upstream chart defaults `artifactRoot.defaultArtifactRoot` to `./mlruns`, a relative
path in the container's writable layer — the image's workdir is `/mlflow`, so
`/mlflow/mlruns`. The pod has no PVC mounted there, so a restart, rollout, upgrade, or
eviction discards everything logged.

What makes this worse than plain data loss: run metadata in PostgreSQL survives. You are
left with a registry full of runs whose model files no longer exist, and no error until
someone tries to load one.
:::

Configure a bucket before people start logging models.

## Amazon S3

```yaml
mlflow:
  artifactRoot:
    proxiedArtifactStorage: true
    s3:
      enabled: true
      bucket: my-mlflow-artifacts
      path: ""                      # optional prefix
      existingSecret:
        name: mlflow-s3-credentials
        keyOfAccessKeyId: AWS_ACCESS_KEY_ID
        keyOfSecretAccessKey: AWS_SECRET_ACCESS_KEY
```

Create the credentials secret separately, in the release namespace:

```bash
kubectl -n mlflow create secret generic mlflow-s3-credentials \
  --from-literal=AWS_ACCESS_KEY_ID=... \
  --from-literal=AWS_SECRET_ACCESS_KEY=...
```

The upstream chart also accepts `awsAccessKeyId` and `awsSecretAccessKey` inline. Use the
existing-secret form on any cluster whose values live in git.

For IRSA or another pod-identity mechanism, omit the credentials entirely and annotate the
service account with the role ARN.

## S3-compatible storage (MinIO, Hetzner, Backblaze)

Same `s3` block, plus an endpoint override:

```yaml
mlflow:
  extraEnvVars:
    MLFLOW_S3_ENDPOINT_URL: http://minio.minio.svc.cluster.local:9000
    AWS_DEFAULT_REGION: us-east-1
```

## Google Cloud Storage

```yaml
mlflow:
  artifactRoot:
    proxiedArtifactStorage: true
    gcs:
      enabled: true
      bucket: my-mlflow-artifacts
      path: ""
```

## Azure Blob Storage

```yaml
mlflow:
  artifactRoot:
    proxiedArtifactStorage: true
    azureBlob:
      enabled: true
      container: mlflow-artifacts
      storageAccount: mystorageaccount
      connectionString: ""   # or accessKey
```

## Proxied vs direct access

`proxiedArtifactStorage: true` routes artifact uploads and downloads **through the MLflow
server**, which holds the bucket credentials. Clients need no bucket access of their own.

That is the right default here. JupyterHub notebooks already reach the tracking server over
the cluster network; giving every notebook pod its own bucket credentials would be a
larger blast radius for no gain.

The cost is that artifact traffic passes through the MLflow pod, so large model uploads
consume its bandwidth and memory. For very large artifacts with clients that can be trusted
with credentials, set it to `false` and let clients talk to the bucket directly.

## Verifying

After the change, log something and confirm it landed:

```python
import mlflow
mlflow.set_experiment("artifact-check")
with mlflow.start_run() as run:
    with open("hello.txt", "w") as f:
        f.write("hi")
    mlflow.log_artifact("hello.txt")
    print(mlflow.get_artifact_uri())
```

With `proxiedArtifactStorage: true` the printed URI is
`mlflow-artifacts:/<experiment>/<run>/artifacts` — the client talks to the tracking server,
which is the one holding the bucket credentials. That is the success case; a plain local
filesystem path is the failure case. Confirm the object actually landed by looking in the
bucket. With proxying off, the URI is the bucket scheme directly (`s3://`, `gs://`,
`wasbs://`).

The server's artifact configuration is on its command line, not in its environment — the
chart passes `--artifacts-destination` (proxied) or `--default-artifact-root` (direct) as
flags:

```bash
kubectl -n mlflow get deploy mlflow-pack \
  -o jsonpath='{.spec.template.spec.containers[0].args}'
```

## Migrating existing artifacts

There is no migration path from the ephemeral default, because by the time you notice, the
files are usually already gone. If a pod is still running with artifacts you care about,
copy them out before changing anything:

```bash
kubectl cp mlflow/<pod>:/mlflow/mlruns ./mlruns-backup
```

Then reconfigure the artifact root. Existing runs keep their recorded artifact URIs, so
they will still point at the old local paths — new runs use the bucket. Re-logging is
usually simpler than rewriting URIs in the database.

## Autoscaling

The upstream chart notes that `autoscaling` is only supported when the backend store is not
SQLite **and** the artifact root is one of the blob storage backends. With the default
local artifact root, replicas would each hold a different subset of artifacts. Configuring
a bucket is a prerequisite for running more than one MLflow replica.
