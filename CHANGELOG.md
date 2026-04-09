# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-04-09

### Added
- kubeconform schema validation in CI
- Upgrade test (install then re-apply) in CI
- `examples/nebari-values.yaml` — canonical ArgoCD Application example for Nebari deployments
- `examples/standalone-values.yaml` — minimal values for non-Nebari deployments
- Pinned container images: MLflow `3.7.0`, PostgreSQL `17.5.0`

### Changed
- Consolidated ArgoCD Application example and Helm values into single `nebari-values.yaml`

## [0.0.1] - 2026-04-01

### Added
- NebariApp CRD template for automatic routing, TLS, and Keycloak auth via nebari-operator
- Bundled Bitnami PostgreSQL for persistent experiment/run storage
- `existingSecret` support for PostgreSQL credentials (recommended for production)
- Automatic `MLFLOW_SERVER_ALLOWED_HOSTS` configuration derived from NebariApp hostname
  and cluster-internal service name
- `security.additionalAllowedHosts` for whitelisting extra hosts
- Landing page support for nebari-operator
- ArgoCD Application example using published Helm chart repo
- CI: helm lint, standalone kind cluster test, full integration test with nebari-operator
- Documentation: auth flow guide, NebariApp CRD reference

### Fixed
- MLflow security middleware rejects requests when accessed via gateway hostname
  (resolved by auto-whitelisting via `MLFLOW_SERVER_ALLOWED_HOSTS` env var instead
  of disabling the middleware)
- Gunicorn/uvicorn incompatibility with security middleware flags
  (defaulted `mlflow.log.enabled: false` to use uvicorn)
