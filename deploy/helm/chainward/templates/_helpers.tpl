{{/*
Common labels
*/}}
{{- define "chainward.labels" -}}
app.kubernetes.io/name: {{ .Chart.Name }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels for a component
*/}}
{{- define "chainward.selectorLabels" -}}
app.kubernetes.io/name: {{ .Chart.Name }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/component: {{ .component }}
{{- end }}

{{/*
Pod-level hardening shared by every workload. The images set USER node, so
runAsNonRoot is an enforcement of what the Dockerfile already does — a rebuilt
image that forgot USER fails admission instead of silently running as root.
No workload talks to the Kubernetes API, so the service-account token is
never mounted; an RCE in a pod finds no cluster credential on disk.
*/}}
{{- define "chainward.podSecurity" -}}
automountServiceAccountToken: false
securityContext:
  runAsNonRoot: true
  runAsUser: 1000
  runAsGroup: 1000
  fsGroup: 1000
  seccompProfile:
    type: RuntimeDefault
{{- end }}

{{- define "chainward.containerSecurity" -}}
securityContext:
  allowPrivilegeEscalation: false
  capabilities:
    drop: ["ALL"]
{{- end }}
