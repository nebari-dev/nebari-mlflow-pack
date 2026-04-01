{{/*
Expand the name of the chart.
*/}}
{{- define "nebari-mlflow-pack.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
We truncate at 63 chars because some Kubernetes name fields are limited to this (by the DNS naming spec).
If release name contains chart name it will be used as a full name.
*/}}
{{- define "nebari-mlflow-pack.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "nebari-mlflow-pack.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "nebari-mlflow-pack.labels" -}}
helm.sh/chart: {{ include "nebari-mlflow-pack.chart" . }}
{{ include "nebari-mlflow-pack.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "nebari-mlflow-pack.selectorLabels" -}}
app.kubernetes.io/name: {{ include "nebari-mlflow-pack.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
MLflow service name - the community chart creates a service using its fullname template,
which resolves to just <release> when the subchart name matches (since the dependency
key "mlflow" is contained in the release name pattern).
*/}}
{{- define "nebari-mlflow-pack.mlflow-service-name" -}}
{{- .Release.Name }}
{{- end }}

{{/*
Compute the comma-separated list of allowed hosts for MLflow's security middleware.
Includes: NebariApp hostname, cluster-internal service name, and any user-specified extras.
*/}}
{{- define "nebari-mlflow-pack.allowed-hosts" -}}
{{- $hosts := list }}
{{- if and .Values.nebariapp.enabled .Values.nebariapp.hostname }}
  {{- $hosts = append $hosts .Values.nebariapp.hostname }}
{{- end }}
{{- $svcName := include "nebari-mlflow-pack.mlflow-service-name" . }}
{{- $hosts = append $hosts (printf "%s.%s.svc.cluster.local" $svcName .Release.Namespace) }}
{{- range .Values.security.additionalAllowedHosts }}
  {{- $hosts = append $hosts . }}
{{- end }}
{{- join "," $hosts }}
{{- end }}
