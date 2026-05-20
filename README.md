# Nebari MLflow Pack

# Contributing to the documentation 📝

Nebari's documentation is built with [Docusaurus 2](https://docusaurus.io/), a modern static website generator.

- [Contributing to the documentation 📝](#contributing-to-the-documentation-)
  - [Setting your local development environment](#setting-your-local-development-environment)
    - [Prerequisites](#prerequisites)
    - [Installing docs dependencies](#installing-docs-dependencies)
    - [Pre-commit hooks](#pre-commit-hooks)
    - [Working on the docs](#working-on-the-docs)
    - [Building the site locally](#building-the-site-locally)
  - [Adding a New Dependency](#adding-a-new-dependency)
  - [Deployment](#deployment)
  - [Linting](#linting)

## Setting your local development environment

1. Make a fork of the [`Nebari- MLflow pack` repository][nebari-mlflow-repo] to your GitHub account
2. Clone the forked repository to your local machine:

   ```bash
   git clone https://github.com/<your-username>/nebari-mlflow-pack.git
   ```

### Prerequisites

To build the site you will need to have Node.js installed. To see if you already have Node.js installed, type the following command into your local command line terminal:

```console
$ node -v
v14.17.0
```

If you see a version number, such as `v14.17.0` printed, you have Node.js installed. If you get a `command not found` error (or similar phrasing), please install Node.js before continuing.

To install node visit [nodejs.org](https://nodejs.org/en/download/) or check any of these handy tutorials for [Ubuntu](https://www.digitalocean.com/community/tutorials/how-to-install-node-js-on-ubuntu-20-04), [Debian](https://www.digitalocean.com/community/tutorials/how-to-install-node-js-on-debian-10), or [macOS](https://www.digitalocean.com/community/tutorials/how-to-install-node-js-and-create-a-local-development-environment-on-macos).

Once you have Node.js installed you can proceed to install Yarn. Yarn has a unique way of installing and running itself in your JavaScript projects. First you install the yarn command globally, then you use the global yarn command to install a specific local version of Yarn into your project directory.

The Yarn maintainers recommend installing Yarn globally by using the `NPM` package manager, which is included by default with all Node.js installations.
Use the `-g` flag with `npm` install to do this:

```bash
npm install -g yarn
```

After the package installs, have the yarn command print its own version number. This will let you verify it was installed properly:

```console
$ yarn --version
1.22.11
```

### Installing docs dependencies

1. First make sure to be in the `/docs` directory:

   ```bash
   cd docs
   ```

2. Install the necessary dependencies:

   ```bash
   yarn install
   ```

### Pre-commit hooks

This repository uses a number of [pre-commit hooks](https://pre-commit.com/) to standardize our YAML and markdown structure.
**Note** - You will need to have Python>= 3.7 installed in your local machine.

1. Before you can run the hooks, you need to install the pre-commit package manager:

   ```bash
   # using pip
   pip install pre-commit

   # if you prefer using conda
   conda install -c conda-forge pre-commit
   ```

2. From the root of this project, install the git hook scripts:

   ```bash
   # install the pre-commit hooks
   pre-commit install
   ```

3. Optional- run the hooks against the files in this repository

   ```bash
   # run the pre-commit hooks
   pre-commit run --all-files
   ```

Once installed, the pre-commit hooks will run automatically when you make a commit in version control.

### Working on the docs

Once you have the pre-commits and the dependencies installed, you can get started with the documentation.
To see a live local version of the docs run the following command:

```bash
yarn start
```

This command starts a local development server and opens up a browser window.
Most changes are reflected live without having to restart the server.

> **Note**
> By default, this will load your site at <http://localhost:3000/>.

### Building the site locally

To build the static files of the documentation, run:

```bash
yarn build
```

This command generates static content into the `docs/build` directory and can be served using any static contents hosting service.
You can check the new build site with the following command:

```bash
yarn run serve
```

> **Note**
> By default, this will load your site at <http://localhost:3000/>.

## Adding a New Dependency

Use the `add` sub command to add new dependencies:

```bash
yarn add package-name
```

## Linting

Before opening a PR, run the docs linter and formatter to ensure code consistency. From the `docs` directory, run:

```bash
yarn run lint
yarn run format
```

<!-- links -->

[nebari-mlflow-repo]: https://github.com/nebari-dev/nebari-mlflow-pack

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

   The secret name **must** be `<release-name>-postgresql` and contain keys
   `password` (mlflow DB user) and `postgres-password` (superuser).

2. **Copy the example ArgoCD Application and edit it for your cluster:**

   ```bash
   cp examples/nebari-values.yaml /path/to/your/gitops-repo/apps/mlflow-pack.yaml
   ```

   Update `nebariapp.hostname`, `nebariapp.keycloakHostname`, and
   `mlflow.postgresql.primary.persistence.storageClass` for your environment.

3. **Add `mlflow.<your-domain>` to your gateway certificate and DNS.**

See [examples/nebari-values.yaml](examples/nebari-values.yaml) for
the full ArgoCD Application manifest.

## Connecting JupyterHub

To allow [nebari-data-science-pack](https://github.com/nebari-dev/nebari-data-science-pack)
notebooks to log experiments to MLflow, add the following to your
data-science-pack ArgoCD Application values:

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

The egress rule uses port **5000** (the pod port) because NetworkPolicy operates
at the pod IP level, not the ClusterIP service level (which maps 80 to 5000).

After applying, existing JupyterLab sessions must be restarted (stop/start from
the hub control panel) to pick up the new environment variable and NetworkPolicy.

### Verify from a notebook

```python
import mlflow
mlflow.set_experiment("test")
with mlflow.start_run():
    mlflow.log_param("framework", "pytorch")
    mlflow.log_metric("accuracy", 0.95)
print("Run ID:", mlflow.last_active_run().info.run_id)
```

## Configuration

### PostgreSQL

By default, this chart bundles a Bitnami PostgreSQL instance. For dev/testing
you can pass the password inline instead of creating a secret:

```bash
helm install mlflow-pack . \
  --set mlflow.postgresql.auth.password=my-dev-password
```

**Do not use inline passwords in production or commit them to a gitops repository.**

To disable PostgreSQL and use in-memory SQLite (data lost on pod restart):

```yaml
mlflow:
  postgresql:
    enabled: false
```

### Allowed Hosts

The chart automatically whitelists the NebariApp hostname and the
cluster-internal service name via `MLFLOW_SERVER_ALLOWED_HOSTS`. To allow
additional hosts:

```yaml
security:
  additionalAllowedHosts:
    - custom-alias.internal
```

## Troubleshooting

### NebariApp not ready

```bash
kubectl get nebariapp -n mlflow
kubectl describe nebariapp -n mlflow
```

Check conditions: `RoutingReady`, `TLSReady`, `AuthReady` should all be `True`.

## License

Apache 2.0 - see [LICENSE](LICENSE).
