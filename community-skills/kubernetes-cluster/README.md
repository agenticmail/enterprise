# Kubernetes Cluster

Manage Kubernetes pods, deployments, and services. Scale workloads and view cluster status.

## Installation

Install this skill from the AgenticMail skill marketplace:

```
agenticmail skills install kubernetes-cluster
```

## Configuration

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `kubeconfig` | string | Yes | Base64-encoded kubeconfig file contents |
| `defaultNamespace` | string | No | Default Kubernetes namespace. Defaults to `default` |

## Tools

### List Pods (`k8s_list_pods`)
List pods in a namespace.

### Scale Deployment (`k8s_scale_deployment`)
Scale a deployment up or down.

### Get Pod Logs (`k8s_get_logs`)
Retrieve logs from a pod.

### List Services (`k8s_list_services`)
List services in a namespace.

## License

Apache-2.0
