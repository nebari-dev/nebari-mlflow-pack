# NebariApp CRD Reference

Complete field-by-field reference for the NebariApp custom resource.

**API Version:** `reconcilers.nebari.dev/v1`
**Kind:** `NebariApp`
**Source:** [nebari-operator/api/v1/nebariapp_types.go](https://github.com/nebari-dev/nebari-operator/blob/main/api/v1/nebariapp_types.go)

## Full Example

```yaml
apiVersion: reconcilers.nebari.dev/v1
kind: NebariApp
metadata:
  name: my-pack
  namespace: my-pack
spec:
  hostname: my-pack.nebari.example.com
  service:
    name: my-pack
    port: 80
  routing:
    routes:
      - pathPrefix: /
        pathType: PathPrefix
    tls:
      enabled: true
  auth:
    enabled: true
    provider: keycloak
    provisionClient: true
    enforceAtGateway: true
    redirectURI: /
    scopes:
      - openid
      - profile
      - email
    groups:
      - admin
  gateway: public
```

## spec

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `hostname` | string | Yes | - | FQDN where the app will be accessible. Used to generate HTTPRoute and TLS certificate. Must match pattern `^[a-z0-9]([-a-z0-9]*[a-z0-9])?(\.[a-z0-9]([-a-z0-9]*[a-z0-9])?)*$`. |
| `service` | [ServiceReference](#specservice) | Yes | - | The backend Kubernetes Service that receives traffic. |
| `routing` | [RoutingConfig](#specrouting) | No | - | Routing behavior including path rules and TLS. |
| `auth` | [AuthConfig](#specauth) | No | - | Authentication/authorization configuration. |
| `gateway` | string | No | `"public"` | Which shared Gateway to use. Valid values: `public`, `internal`. |

## spec.service

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `name` | string | Yes | - | Name of the Kubernetes Service in the same namespace. |
| `port` | int32 | Yes | - | Port number on the Service to route traffic to. Range: 1-65535. |

## spec.routing

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `routes` | [][RouteMatch](#specroutingroutes) | No | - | Path-based routing rules. If omitted, all traffic to the hostname is routed to the service. |
| `tls` | [RoutingTLSConfig](#specroutingtls) | No | - | TLS certificate management configuration. |

### spec.routing.routes[]

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `pathPrefix` | string | Yes | - | Path prefix to match. Must start with `/`. Examples: `/`, `/api/v1`, `/dashboard`. |
| `pathType` | string | No | `"PathPrefix"` | How the path is matched. Values: `PathPrefix` (match prefix), `Exact` (exact match). |

### spec.routing.tls

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `enabled` | *bool | No | `true` | Whether to provision a TLS certificate via cert-manager and configure an HTTPS listener on the Gateway. When `false`, only HTTP listeners are used. |

## spec.auth

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `enabled` | bool | No | `false` | Whether to enforce OIDC authentication. |
| `provider` | string | No | `"keycloak"` | OIDC provider. Values: `keycloak`, `generic-oidc`. |
| `provisionClient` | *bool | No | `true` | Auto-provision an OIDC client in the provider. Only supported for `keycloak`. The operator creates the client and stores credentials in a Secret. |
| `enforceAtGateway` | *bool | No | `true` | Create an Envoy Gateway SecurityPolicy for gateway-level auth. When `false`, the operator provisions the client and Secret but does NOT create a SecurityPolicy - the app handles OAuth natively (e.g., Grafana's built-in OAuth). |
| `redirectURI` | string | No | `"/oauth2/callback"` | OAuth2 callback path. The full URL is `https://<hostname><redirectURI>`. |
| `clientSecretRef` | *string | No | - | Reference to a Secret containing `client-id` and `client-secret`. If omitted and `provisionClient` is true, the operator creates `<name>-oidc-client`. |
| `scopes` | []string | No | `["openid", "profile", "email"]` | OIDC scopes to request during authentication. |
| `groups` | []string | No | - | Groups that have access. When specified, only users in these groups are authorized. Case-sensitive. |
| `issuerURL` | string | No | - | OIDC issuer URL. Required when `provider=generic-oidc`, ignored for `keycloak`. Example: `https://accounts.google.com`. |

## Status

The operator sets conditions on the NebariApp status to indicate readiness:

| Condition | Description |
|-----------|-------------|
| `RoutingReady` | HTTPRoute has been created and the Gateway is routing traffic. |
| `TLSReady` | TLS certificate is provisioned and the HTTPS listener is configured. |
| `AuthReady` | SecurityPolicy is created and OIDC client is available. Only set when `auth.enabled=true`. |
| `Ready` | Aggregate condition - all components are ready. |

### Condition Reasons

| Reason | Description |
|--------|-------------|
| `Available` | Resource is functioning correctly. |
| `Reconciling` | Reconciliation is in progress. |
| `ReconcileSuccess` | Reconciliation completed successfully. |
| `ValidationSuccess` | Validation passed successfully. |
| `NamespaceNotOptedIn` | Namespace is missing the `nebari.dev/managed=true` label. |
| `ServiceNotFound` | The referenced Service does not exist in the namespace. |
| `SecretNotFound` | The referenced Secret does not exist. |
| `GatewayNotFound` | The target Gateway does not exist. |
| `CertificateNotReady` | The cert-manager Certificate is not yet ready. |
| `Failed` | Reconciliation failed. |

## Namespace Opt-In

The namespace containing the NebariApp must be labeled for the operator to process it:

```bash
kubectl label namespace my-pack nebari.dev/managed=true
```

Without this label, the NebariApp will show `NamespaceNotOptedIn` and no resources will be created.

## Deployment Patterns

The NebariApp resource can be included in your pack using any deployment method.

### Plain YAML

The NebariApp is just another manifest file alongside your Deployment and Service:

```yaml
# nebariapp.yaml
apiVersion: reconcilers.nebari.dev/v1
kind: NebariApp
metadata:
  name: my-pack
spec:
  hostname: my-pack.nebari.example.com
  service:
    name: my-pack
    port: 80
```

When deploying standalone (without Nebari), skip this file in your `kubectl apply`.

### Kustomize

Include the NebariApp in your base `kustomization.yaml` and use overlays to
patch environment-specific values like `hostname` and `auth`:

```yaml
# overlays/production/nebariapp-patch.yaml
apiVersion: reconcilers.nebari.dev/v1
kind: NebariApp
metadata:
  name: my-pack
spec:
  hostname: my-pack.nebari.example.com
  auth:
    enabled: true
    groups:
      - admin
```

### Helm

In Helm charts, you can make the NebariApp conditional so the chart works both
standalone and on Nebari:

```yaml
{{- if .Values.nebariapp.enabled }}
apiVersion: reconcilers.nebari.dev/v1
kind: NebariApp
metadata:
  name: {{ include "my-pack.fullname" . }}
  namespace: {{ .Release.Namespace }}
  labels:
    {{- include "my-pack.labels" . | nindent 4 }}
spec:
  hostname: {{ required "nebariapp.hostname is required" .Values.nebariapp.hostname }}
  service:
    name: {{ .Values.nebariapp.service.name | default (include "my-pack.fullname" .) }}
    port: {{ .Values.nebariapp.service.port | default 80 }}
  {{- with .Values.nebariapp.auth }}
  auth:
    enabled: {{ .enabled | default false }}
    provider: {{ .provider | default "keycloak" }}
    provisionClient: {{ .provisionClient | default true }}
    redirectURI: {{ .redirectURI | default "/" }}
    {{- with .scopes }}
    scopes:
      {{- toYaml . | nindent 6 }}
    {{- end }}
  {{- end }}
{{- end }}
```

The corresponding `values.yaml` section:

```yaml
nebariapp:
  enabled: false
  # hostname: my-pack.nebari.example.com  # Required when enabled
  service:
    name: ""   # Defaults to release fullname
    port: 80
  auth:
    enabled: false
    provider: keycloak
    provisionClient: true
    redirectURI: /
    scopes:
      - openid
      - profile
      - email
  gateway: public
```
